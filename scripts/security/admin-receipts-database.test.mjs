import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { initdb, pg_ctl as pgCtl } from '@embedded-postgres/windows-x64';

const root = await mkdtemp(path.join(tmpdir(), 'hl-admin-receipts-'));
const data = path.join(root, 'data');
const port = await new Promise(resolve => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const run = (exe, args) => new Promise((resolve, reject) => {
  let output = '';
  const child = spawn(exe, args, { windowsHide: true, env: { ...process.env,
    PATH: `${path.dirname(initdb)}${path.delimiter}${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Postgres exited ${code}: ${output}`)));
});
const clients = [];
let started = false;
try {
  await run(initdb, ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale']);
  await run(pgCtl, ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-F -p ${port} -h 127.0.0.1`, '-w', 'start']);
  started = true;
  for (let i = 0; i < 2; i++) {
    const client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
    await client.connect(); clients.push(client);
  }
  const [a, b] = clients;
  await a.query(`create role anon; create role authenticated; create role service_role;
    create table public.orders(id uuid primary key, status text, rx jsonb);
    create table public.order_events(id uuid primary key default gen_random_uuid(), order_id uuid references orders(id),
      event_type text, actor text, message text, "after" jsonb, created_at timestamptz default now());
    alter table orders enable row level security; alter table order_events enable row level security;
    create policy service_orders on orders to service_role using (true) with check (true);
    create policy service_events on order_events to service_role using (true) with check (true);
    grant select on orders to service_role; grant select, insert on order_events to service_role;`);
  await a.query(await readFile('supabase/migrations/20260910141625_admin_receipt_actions.sql', 'utf8'));
  const order = randomUUID(), request = randomUUID();
  await a.query("insert into orders values ($1, 'captured', '{\"right\":{\"sphere\":-2}}')", [order]);
  const before = (await a.query('select * from orders')).rows;
  for (const client of clients) await client.query('set role service_role');
  const claim = (client, id = randomUUID(), type = 'receipt') => client.query(
    'select public.claim_admin_receipt_send($1,$2,$3,$4) as result', [order, id, type, 'test-admin']);
  const outcomes = await Promise.all([claim(a, request), claim(b)]);
  assert.equal(outcomes.filter(x => x.rows[0].result.claimed).length, 1, 'Concurrent sends must claim once');
  assert.equal((await claim(a, request)).rows[0].result.claimed, false, 'Request replay blocked');
  // Find the winner because either database connection may claim first.
  const winner = (await a.query("select \"after\"->>'request_id' as id from order_events where event_type='admin_receipt_requested' limit 1")).rows[0].id;
  await a.query('reset role');
  await a.query("update order_events set created_at=now()-interval '2 days'");
  await a.query('set role service_role');
  assert.equal((await claim(a)).rows[0].result.claimed, false, 'Pending sends never expire into duplicates');
  assert.equal((await claim(b, randomUUID(), 'itemized')).rows[0].result.claimed, true, 'Types are independent');
  await a.query(`insert into order_events(order_id,event_type,"after") values($1,'admin_receipt_failed',jsonb_build_object('request_id',$2::text,'receipt_type','receipt'))`, [order, winner]);
  assert.equal((await claim(a)).rows[0].result.claimed, true, 'Definitive failure permits a new request');
  const current = (await a.query("select \"after\"->>'request_id' as id from order_events where event_type='admin_receipt_requested' and \"after\"->>'receipt_type'='receipt' order by created_at desc limit 1")).rows[0].id;
  await a.query(`insert into order_events(order_id,event_type,"after") values($1,'admin_receipt_sent',jsonb_build_object('request_id',$2::text,'receipt_type','receipt'))`, [order, current]);
  assert.equal((await claim(a)).rows[0].result.claimed, false, 'Cooldown prevents a rapid repeated click');
  assert.deepEqual((await a.query('select * from orders')).rows, before, 'No order, Rx, or status mutation');
  for (const role of ['anon', 'authenticated']) {
    await a.query(`set role ${role}`);
    await assert.rejects(claim(a), error => error.code === '42501');
  }
  await a.query('reset role');
  const fn = (await a.query("select prosecdef, proconfig from pg_proc where proname='claim_admin_receipt_send'")).rows[0];
  assert.equal(fn.prosecdef, false); assert.ok(fn.proconfig.some(value => value.startsWith('search_path=')));
  console.log('Local PostgreSQL receipt checks passed: concurrent claims, replay, cooldown, uncertain outcome, failure recovery, service-only grants, and no order mutation.');
} finally {
  for (const client of clients) await client.end();
  if (started) await run(pgCtl, ['-D', data, '-m', 'immediate', '-w', 'stop']);
}
