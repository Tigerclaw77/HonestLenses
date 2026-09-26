import assert from 'node:assert/strict';
import { commercialEmailHash, deliveryToken, nextStuckAlert, optOutSignature, shouldNotifyStuck, validOptOut, actionablePaymentStatus } from './orderOperations';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
process.env.ORDER_RESUME_TOKEN_SECRET='synthetic-operations-secret';
process.env.RESEND_API_KEY='re_test_only';
process.env.FOUNDER_ALERT_EMAIL='founder@example.test';
globalThis.fetch=async()=>{throw new Error('Network forbidden in operations tests');};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row=Record<string, any>; // Synthetic PostgREST fixture, never connected to a database.
const ago=(hours:number)=>new Date(Date.now()-hours*3_600_000).toISOString();
const base={id:'00000000-0000-4000-8000-000000000001',status:'draft',sku:'OASYS_1D_90',shipping_email:'fixture@invalid.local',created_at:ago(2),updated_at:ago(2)};
const paid={...base,status:'captured',fulfillment_status:'review',updated_at:ago(25)};
assert.equal(actionablePaymentStatus({status:'succeeded',amount_received:10000},{refunded:false,amount_refunded:1000}),'captured','Partial refund does not hide a paid order');
assert.equal(actionablePaymentStatus({status:'succeeded',amount_received:10000},{refunded:true,amount_refunded:10000}),'refunded');
let alert=nextStuckAlert(paid,null);
assert.ok(alert.active && shouldNotifyStuck(alert));
assert.equal(nextStuckAlert({...paid,updated_at:new Date().toISOString()},alert).state_since,alert.state_since,'Unrelated updates cannot reset aging');
assert.equal(shouldNotifyStuck({...alert,notification_claimed_at:ago(1)}),false);
assert.equal(shouldNotifyStuck({...alert,acknowledged_until:ago(-1)}),false);
assert.equal(shouldNotifyStuck({...alert,acknowledged_until:ago(1)}),true);
for(const status of ['draft','cancelled','refunded','completed','failed'])assert.equal(nextStuckAlert({...paid,status},alert).active,false);
for(const fulfillment_status of ['completed','delivered','cancelled'])assert.equal(nextStuckAlert({...paid,fulfillment_status},alert).active,false);
for(const [fulfillment_status,hours] of [['ordered',72],['backordered',72],['shipped',240]] as const){
  assert.equal(nextStuckAlert({...paid,fulfillment_status,updated_at:ago(hours-1)},null).active,false);
  assert.equal(nextStuckAlert({...paid,fulfillment_status,updated_at:ago(hours+1)},null).active,true);
}
alert=nextStuckAlert({...paid,fulfillment_status:'ordered'},alert);
assert.equal(alert.active,false);assert.equal(alert.notification_claimed_at,null);
const hash=commercialEmailHash(base.shipping_email),signature=optOutSignature(hash);
assert.equal(hash,commercialEmailHash(' Fixture@invalid.local '));
assert.ok(validOptOut(hash,signature));assert.equal(validOptOut(hash,'a'.repeat(64)),false);
assert.match(deliveryToken(base.id,ago(-24)),/^[A-Za-z0-9_-]{43}$/);

async function main(){
  const {supabaseServer:db}=await import('./supabase-server');
  const {processRecovery,replacementOrSuppression}=await import('./orderOperationsServer');
  const {GET,POST}=await import('@/app/recovery/opt-out/route');
  const tables:Record<string,Row[]>={};
  let disableAfterClaim=false;
  const selectedColumns:Record<string,string[]>={};
  const reset=()=>{
    tables.orders=[{...base}];tables.recovery_touch_drafts=[];tables.commercial_email_suppressions=[];tables.order_stuck_alerts=[];
    tables.order_operations_control=[{id:true,recovery_enabled:false,postal_address:'Synthetic fixture postal address'}];
    disableAfterClaim=false;
  };reset();
  db.from=((table:string)=>{
    assert.ok(table in tables,`Unexpected table ${table}`);
    const filters:((r:Row)=>boolean)[]=[];
    let operation='select',value:Row={},executed=false,result:Row[]=[];
    const execute=()=>{
      if(executed)return {data:result,error:null};executed=true;
      const rows=tables[table].filter(r=>filters.every(f=>f(r)));
      if(operation==='insert'){
        assert.notEqual(table,'orders','Recovery cannot create an order');
        if(tables[table].some(r=>r.order_id===value.order_id&&r.touch_hours===value.touch_hours))return {data:null,error:{code:'23505'}};
        result=[{state:'pending_founder_approval',...value}];tables[table].push(...result);
      }else if(operation==='update'){assert.notEqual(table,'orders');rows.forEach(r=>Object.assign(r,value));result=rows;}
      else if(operation==='upsert'){
        const key=table==='commercial_email_suppressions'?'email_hash':'order_id';
        const row=tables[table].find(r=>r[key]===value[key]);if(row)Object.assign(row,value);else tables[table].push({...value});result=[value];
      }else result=rows;
      return {data:structuredClone(result),error:null};
    };
    const q={
      select:(columns:string)=>{(selectedColumns[table]??=[]).push(columns);return q;},order:()=>q,range:()=>q,
      eq:(k:string,v:unknown)=>{filters.push(r=>r[k]===v);return q;},
      is:(k:string,v:unknown)=>{filters.push(r=>(r[k]??null)===v);return q;},
      in:(k:string,v:unknown[])=>{filters.push(r=>v.includes(r[k]));return q;},
      gte:(k:string,v:string)=>{filters.push(r=>r[k]>=v);return q;},
      insert:(v:Row)=>{operation='insert';value=v;return q;},
      update:(v:Row)=>{operation='update';value=v;return q;},
      upsert:(v:Row)=>{operation='upsert';value=v;return q;},
      single:async()=>{const r=execute();return {...r,data:r.data?.[0]??null};},
      maybeSingle:async()=>{const r=execute();return {...r,data:r.data?.[0]??null};},
      then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(execute()).then(resolve),
    };return q;
  }) as unknown as typeof db.from;
  db.rpc=(async(name:string,args:Row)=>{
    assert.equal(name,'claim_recovery_delivery');
    const d=tables.recovery_touch_drafts.find(r=>r.id===args.p_id);
    const claim=Boolean(tables.order_operations_control[0].recovery_enabled&&d&&(d.state==='pending_founder_approval'||d.state==='sending'&&Date.parse(d.last_attempt_at)<Date.now()-300_000));
    if(claim){Object.assign(d!,{state:'sending',first_attempt_at:d!.first_attempt_at??new Date().toISOString(),last_attempt_at:new Date().toISOString()});}
    if(disableAfterClaim)tables.order_operations_control[0].recovery_enabled=false;
    return {data:claim,error:null};
  }) as unknown as typeof db.rpc;
  let sends:Row[]=[];
  const send=async(input:Row)=>{sends.push(input);return {data:{id:'fixture-email'},error:null,headers:null};};
  assert.equal(await processRecovery(base,[base],send),'disabled');assert.equal(sends.length,0);
  tables.order_operations_control[0].recovery_enabled=true;
  await Promise.all(Array.from({length:5},()=>processRecovery(base,[base],send)));
  assert.equal(sends.length,1);assert.equal(tables.recovery_touch_drafts.length,1);assert.equal(tables.recovery_touch_drafts[0].state,'sent');
  assert.equal(sends[0].subject,'Complete your Honest Lenses order');
  assert.match(sends[0].text,/It looks like you started an order with Honest Lenses but didn’t finish checking out\./);
  assert.doesNotMatch(sends[0].text,/discount|coupon|Synthetic fixture postal/i);
  assert.ok(sends[0].headers['List-Unsubscribe']);
  await processRecovery(base,[base],send);assert.equal(sends.length,1,'Restart does not resend');
  assert.ok(replacementOrSuppression(base,[base,{...base,id:'new',status:'authorized',created_at:ago(1)}]));
  reset();sends=[];tables.order_operations_control[0].recovery_enabled=true;disableAfterClaim=true;
  assert.equal(await processRecovery(base,[base],send),'disabled');assert.equal(sends.length,0,'Kill switch rechecked before delivery');
  reset();tables.order_operations_control[0].recovery_enabled=true;
  const fail=async(input:Row)=>{sends.push(input);throw new Error('Simulated timeout after provider acceptance');};
  assert.equal(await processRecovery(base,[base],fail),'retry_pending');
  tables.recovery_touch_drafts[0].last_attempt_at=ago(1);
  tables.order_operations_control[0].postal_address='Changed address must not change retry body';
  assert.equal(await processRecovery(base,[base],send),'sent');assert.deepEqual(sends[0],sends[1],'Retry uses identical key AND content');
  Object.assign(tables.recovery_touch_drafts[0],{state:'sending',first_attempt_at:ago(23.5),last_attempt_at:ago(1)});
  assert.equal(await processRecovery(base,[base],send),'needs_review');assert.equal(sends.length,2);
  const old={...base,updated_at:ago(25)};tables.orders=[old];
  assert.equal(await processRecovery(old,[old],send),'needs_review','Uncertain first touch blocks second touch');
  assert.ok((selectedColumns.orders ?? []).every((columns)=>!columns.includes('*')));
  assert.ok((selectedColumns.order_operations_control ?? []).every((columns)=>columns==='recovery_enabled,postal_address'));
  assert.ok((selectedColumns.recovery_touch_drafts ?? []).every((columns)=>!columns.includes('*')));
  reset();sends=[];tables.order_operations_control[0].recovery_enabled=true;
  const url=`https://honestlenses.com/recovery/opt-out?email=${hash}&signature=${signature}`;
  assert.equal((await GET(new Request(url))).status,200);assert.equal(tables.commercial_email_suppressions.length,0,'Link scanners do not unsubscribe');
  assert.equal((await POST(new Request(url+'x',{method:'POST'}))).status,400);
  for(let i=0;i<2;i++)assert.equal((await POST(new Request(url,{method:'POST'}))).status,200);
  assert.equal(tables.commercial_email_suppressions.length,1);
  assert.equal(await processRecovery(base,[base],send),'ineligible');assert.equal(sends.length,0);
  const {GET:run}=await import('@/app/api/internal/order-operations/route');
  assert.equal((await run(new Request('https://honestlenses.com/api/internal/order-operations'))).status,401);
  console.log('Operations: kill switches, replacement/opt-out exclusion, concurrent dedup, immutable retries, ambiguity stop, durable stuck detection/notification/resolution passed. No network or customer delivery.');
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
