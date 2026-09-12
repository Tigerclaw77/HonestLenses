// Isolated real-route/component regression. No env files or live service calls.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const out = path.resolve("output/admin-queue-reliability-tests");
await mkdir(out, { recursive: true });
await build({entryPoints:["src/lib/admin/queueRefresh.ts"],outfile:path.join(out,"refresh.mjs"),bundle:true,platform:"node",format:"esm"});
const { createQueueRefresh } = await import(pathToFileURL(path.join(out,"refresh.mjs")));
function mockPlugin(mocks) {
  return {name: "isolated-services", setup(b) {
    b.onResolve({filter: /.*/}, a => mocks[a.path] ? {path:a.path,namespace:"mock"} : undefined);
    b.onLoad({filter: /.*/,namespace:"mock"}, a => ({contents:mocks[a.path],loader:"jsx",resolveDir:process.cwd()}));
  }};
}
const order = {
  id:"00000000-0000-4000-8000-000000000001", status:"draft", fulfillment_status:"review",
  verification_status:"unverified", sku:"VITA_12", shipping_email:"fixture@example.test",
  shipping_first_name:"Fixture", shipping_last_name:"Customer", total_amount_cents:20998,
  created_at:new Date().toISOString(), updated_at:new Date().toISOString(),
  payment_intent_id:"pi_fixture", rx:{right:{coreId:"VITA",sphere:-2},expires:"2099-01-01"},
};
const activeOrder = {...order,id:"00000000-0000-4000-8000-000000000002",status:"authorized",verification_status:"verified",
  shipping_first_name:"Active",shipping_last_name:"Fixture",shipping_email:"fixture@invalid.invalid",payment_intent_id:"pi_active"};
let failure = "";
let primaryResults = null;
let auxiliaryResults = {};
const abortSignals = [];
const serviceCalls = [];
globalThis.__queueTestDb = {from(table) {
  let columns, head;
  const query = {
    select(c, options) { columns=c; head=options?.head; return query; },
    order() { return query; }, eq() { return query; }, in() { return query; },
    abortSignal(signal) { abortSignals.push(signal); return query; },
    then(resolve, reject) {
      const name = table === "orders" ? "orders" : table === "order_events" ? "activity" : head ? "count" : "review";
      serviceCalls.push(name);
      if (auxiliaryResults[name]?.length) {
        const next=auxiliaryResults[name].shift();
        return next === "hang" ? new Promise(()=>{}) : Promise.resolve(next).then(resolve,reject);
      }
      if (name === "orders" && primaryResults?.length) return Promise.resolve(primaryResults.shift()).then(resolve,reject);
      if (failure === `${name}_throw`) return Promise.reject(new Error("Network fetch failed")).then(resolve,reject);
      const result = failure === name ? {data:null,count:null,error:{message:"Gateway Timeout",code:"PGRST003"},status:504}
        : {data:table === "orders" ? [order,activeOrder] : [], count:0,error:null,status:200};
      assert.ok(columns);
      return Promise.resolve(result).then(resolve,reject);
    },
  };
  return query;
}};
globalThis.__queueTestStripe = id => { serviceCalls.push("stripe"); return {id,status:id==="pi_active"?"requires_capture":"requires_payment_method",amount:20998,amount_received:0,created:1789160000}; };
globalThis.__queueTestReconcile = ({order}) => { serviceCalls.push("reconcile"); return {status:order.status,changed:false,eventLogged:true}; };
await build({entryPoints:["src/app/api/admin/orders/route.ts"],outfile:path.join(out,"route.mjs"),bundle:true,platform:"node",format:"esm",
  define:{"process.env.STRIPE_SECRET_KEY":'"fixture-only"'},
  plugins:[mockPlugin({
    "next/server":"export const NextResponse={json:(body,init)=>Response.json(body,init)};",
    "@/lib/admin-auth":"export const requireAdminUser=async()=>({ok:true}); export const logAdminAuthFailure=()=>{}; export const adminAuthErrorResponse=()=>{throw Error('unexpected auth failure')};",
    "@/lib/supabase-server":"export const supabaseServer=globalThis.__queueTestDb;",
    "stripe":"export default class Stripe {paymentIntents={retrieve:async(id)=>globalThis.__queueTestStripe(id)}}",
    "@/lib/payments/adminPaymentReconciliation":"export const reconcileAdminPaymentState=async(input)=>globalThis.__queueTestReconcile(input);",
    "@/lib/posthog/server":"export const captureServerEvent=async()=>globalThis.__queueTestPosthog();",
  })],
});
const { GET } = await import(pathToFileURL(path.join(out,"route.mjs")));
globalThis.__queueTestPosthog = () => serviceCalls.push("posthog");
let normalPayload;
for (const mode of ["", "count", "review", "orders", "count_throw", "review_throw", "orders_throw", "activity"]) {
  failure=mode; serviceCalls.length=0;
  const response=await GET(new Request("http://fixture.test/api/admin/orders"));
  const body=await response.json();
  if (mode.startsWith("orders")) {
    assert.equal(response.status,500); assert.equal(body.code,"ORDERS_FETCH_FAILED");
    assert.deepEqual(serviceCalls,["orders","orders"]);
  } else {
    assert.equal(response.status,200);
    assert.equal(body.abandoned[0].id,order.id);
    assert.ok([...body.awaiting_verification,...body.founder_review,...body.ready_to_order,...body.resolve_exception].some(o=>o.id===activeOrder.id));
    assert.ok(serviceCalls.includes("stripe") && serviceCalls.includes("reconcile"));
    if (/count|review/.test(mode)) {
      assert.match(body.recovery_warning,/unavailable/);
      assert.equal(body.abandoned[0].recovery_review.state,"unavailable");
    } else {
      assert.equal(body.recovery_warning,null);
      assert.equal(body.abandoned[0].recovery_review.state,"unresolved");
    }
    if (mode === "activity") assert.match(body.activity_warning,/could not be refreshed/);
    if (!mode) normalPayload=body;
  }
  console.log(`PASS real route ${mode || "healthy"}`);
}

const success = {data:[order,activeOrder],error:null,status:200};
const errorResult = (status,code,message="fixture failure") => ({data:null,error:{code,message},status});
const retryCases = [
  ["first success",[success],200,1],
  ...[502,503,504].map(status=>[`${status} recovered`,[errorResult(status,null),success],200,2]),
  ["504 exhausted",[errorResult(504,null),errorResult(504,null)],500,2],
  ["PostgREST pool timeout",[errorResult(504,"PGRST003"),success],200,2],
  ["network error",[errorResult(0,"","TypeError: fetch failed"),success],200,2],
  ["unrecognized application error",[errorResult(0,null,"Validation failed")],500,1],
  ["invalid upstream code",[errorResult(504,"invalid code")],500,1],
  ...[[401,null],[403,"42501"],[400,"42703"],[404,"42P01"],[400,"PGRST100"],[500,"XX000"],[504,"42501"]]
    .map(([status,code])=>[`${status}/${code} deterministic`,[errorResult(status,code,"Gateway Timeout")],500,1]),
];
for (const [label,results,expectedStatus,reads] of retryCases) {
  failure="";primaryResults=[...results];serviceCalls.length=0;
  const logs=[];
  const delays=[];
  const originalTimer=globalThis.setTimeout;
  globalThis.setTimeout=(callback,delay)=>{if(delay<=250)delays.push(delay);return originalTimer(callback,delay<=250?0:delay);};
  const originals=[console.info,console.warn,console.error];
  console.info=console.warn=console.error=(message,fields)=>logs.push({message,...fields});
  let response;
  try {response=await GET(new Request("http://fixture.test/api/admin/orders"));}
  finally {[console.info,console.warn,console.error]=originals;globalThis.setTimeout=originalTimer;primaryResults=null;}
  const body=await response.json();
  assert.equal(response.status,expectedStatus,label);
  assert.equal(serviceCalls.filter(c=>c==="orders").length,reads,label);
  const attempts=logs.filter(l=>l.query==="orders");
  assert.equal(attempts.length,reads);
  assert.deepEqual(attempts.map(l=>l.attempt),Array.from({length:reads},(_,i)=>i+1));
  assert.ok(attempts.every(l=>l.requestId===response.headers.get("X-Queue-Request-Id") && l.elapsedMs>=0));
  assert.equal(attempts[0].retryScheduled,reads===2);
  assert.equal(attempts.at(-1).recovered,reads===2 && expectedStatus===200);
  assert.equal(delays.length,reads-1);
  assert.ok(delays.every(delay=>delay>=150 && delay<=250));
  if(expectedStatus===500 && reads===1)assert.equal(attempts[0].category,"non_retryable");
  assert.ok(!JSON.stringify(logs).includes("fixture failure"));
  if(expectedStatus===200) {
    assert.equal(body.ready_to_order.length,normalPayload.ready_to_order.length);
    for(const call of ["count","activity","review","posthog"])assert.equal(serviceCalls.filter(c=>c===call).length,1,call);
    for(const call of ["stripe","reconcile"])assert.equal(serviceCalls.filter(c=>c===call).length,2,call); // Once per fixture order.
  } else {assert.equal(body.code,"ORDERS_FETCH_FAILED");assert.ok(serviceCalls.every(c=>c==="orders"));}
  console.log(`PASS primary retry ${label}`);
}

// Every auxiliary read owns its retry/deadline budget, including simultaneous degradation.
const auxiliarySuccess={data:[],count:0,error:null,status:200};
const stages={count:"recovery_count",activity:"order_activity",review:"manual_recovery_review"};
const auxiliaryCases=[
  ["success",[auxiliarySuccess],1,false],
  ...[502,503,504].map(status=>[`${status} recovered`,[errorResult(status,null),auxiliarySuccess],2,false]),
  ["504 exhausted",[errorResult(504,null),errorResult(504,null)],2,true],
  ["network recovered",[errorResult(0,"","TypeError: fetch failed"),auxiliarySuccess],2,false],
  ...[[401,null],[403,"42501"],[400,"42703"],[404,"42P01"],[400,"PGRST100"],[500,"XX000"],[504,"42501"]]
    .map(([status,code])=>[`${status}/${code} deterministic`,[errorResult(status,code,"Gateway Timeout")],1,true]),
  ["deadline exhausted",["hang","hang"],2,true],
];
for (const targets of [["count"],["activity"],["review"],["count","activity","review"]]) {
  for(const [label,results,reads,degraded] of auxiliaryCases) {
    failure="";serviceCalls.length=0;abortSignals.length=0;
    auxiliaryResults=Object.fromEntries(targets.map(name=>[name,[...results]]));
    const logs=[],delays=[],deadlines=[];
    const originalTimer=globalThis.setTimeout;
    const originals=[console.info,console.warn,console.error];
    globalThis.setTimeout=(callback,delay)=>{
      (delay===6000?deadlines:delays).push(delay);
      return originalTimer(callback,delay===6000 && label!=="deadline exhausted"?delay:0);
    };
    console.info=console.warn=console.error=(message,fields)=>logs.push({message,...fields});
    let response;
    try {response=await GET(new Request("http://fixture.test/api/admin/orders"));}
    finally {globalThis.setTimeout=originalTimer;[console.info,console.warn,console.error]=originals;auxiliaryResults={};}
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.ready_to_order.length,normalPayload.ready_to_order.length);
    assert.equal(Boolean(body.recovery_warning),degraded && targets.some(t=>t!=="activity"));
    assert.equal(Boolean(body.activity_warning),degraded && targets.includes("activity"));
    assert.equal(body.abandoned[0].recovery_review.state,body.recovery_warning?"unavailable":"unresolved");
    assert.equal(serviceCalls.filter(c=>c==="orders").length,1);
    for(const [name,stage] of Object.entries(stages)) {
      const expected=targets.includes(name)?reads:1;
      assert.equal(serviceCalls.filter(c=>c===name).length,expected);
      const attempts=logs.filter(l=>l.query===stage);
      assert.equal(attempts.length,expected);
      assert.deepEqual(attempts.map(l=>l.attempt),Array.from({length:expected},(_,i)=>i+1));
      assert.ok(attempts.every(l=>l.requestId===response.headers.get("X-Queue-Request-Id") && l.elapsedMs>=0));
      assert.equal(attempts[0].retryScheduled,expected===2);
      assert.equal(attempts.at(-1).recovered,expected===2 && !degraded);
      assert.equal(attempts.at(-1).retryScheduled,false);
    }
    for(const call of ["stripe","reconcile"])assert.equal(serviceCalls.filter(c=>c===call).length,2);
    assert.equal(serviceCalls.filter(c=>c==="posthog").length,1);
    assert.equal(deadlines.length,3+targets.length*(reads-1));
    assert.equal(delays.length,targets.length*(reads-1));
    assert.ok(delays.every(d=>d>=150 && d<=250));
    assert.ok(deadlines.reduce((a,b)=>a+b,0)+delays.reduce((a,b)=>a+b,0)<=36750);
    if(label==="deadline exhausted")assert.equal(abortSignals.filter(s=>s.aborted).length,targets.length*2);
    assert.ok(!JSON.stringify(logs).includes("fixture failure"));
    console.log(`PASS auxiliary ${targets.join("+")} ${label}`);
  }
}

// Deterministic concurrency, coalescing, backoff and unmount/remount checks.
let release, runs=0, concurrent=0, maxConcurrent=0, clock=0, succeeds=true;
const coordinator=createQueueRefresh(async current => {
  runs++; concurrent++; maxConcurrent=Math.max(maxConcurrent,concurrent);
  await new Promise(resolve=>{release=resolve;});
  concurrent--; return current() && succeeds;
},()=>clock);
coordinator.activate();
const first=coordinator.request();
for(let i=0;i<10;i++) void coordinator.request(false);
assert.equal(runs,1); release(); await new Promise(setImmediate);
assert.equal(runs,2); release(); await first; assert.equal(maxConcurrent,1);
succeeds=false;
let attempt=coordinator.request(); release(); await attempt;
await coordinator.request(false); assert.equal(runs,3);
clock=30_000; attempt=coordinator.request(false); release(); await attempt;
clock=60_000; await coordinator.request(false); assert.equal(runs,4);
// Explicit action bypasses failure backoff.
succeeds=true; attempt=coordinator.request(true); release(); await attempt;
attempt=coordinator.request(false); release(); await attempt; assert.equal(runs,6);
let backoffCalls=0, backoffClock=0;
const backoff=createQueueRefresh(async()=>{backoffCalls++;return false;},()=>backoffClock);
backoff.activate();
for (const due of [0,30_000,90_000,210_000,330_000]) {
  if(due) {backoffClock=due-1;const before=backoffCalls;await backoff.request(false);assert.equal(backoffCalls,before);}
  backoffClock=due;await backoff.request(false);
}
assert.equal(backoffCalls,5);
let accepted=0, finish;
const lifecycle=createQueueRefresh(async current=>{await new Promise(r=>{finish=r;});if(current())accepted++;return true;});
lifecycle.activate(); const old=lifecycle.request(); lifecycle.deactivate(); lifecycle.activate(); void lifecycle.request();
finish(); await new Promise(setImmediate); assert.equal(accepted,0); finish(); await old; assert.equal(accepted,1);
console.log("PASS serialized/coalesced refresh, backoff, explicit bypass, stale lifecycle result rejection");

// Browser tests render the real admin page and CSS with all IO replaced.
await build({stdin:{contents:`import {createRoot} from 'react-dom/client'; import Page from './src/app/admin/orders/page'; import './src/styles/globals.css'; createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:process.cwd(),loader:"tsx"},
  outfile:path.join(out,"app.js"),bundle:true,jsx:"automatic",external:["/*.png"],define:{"process.env.NODE_ENV":'"production"'},
  plugins:[mockPlugin({"@/lib/supabase-client":`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})},channel:()=>({on(_e,_f,cb){window.queueRefresh=cb;return this;},subscribe(){return this;}}),removeChannel(){}};`})],
});
const server=createServer(async(req,res)=>{
  if(req.url==="/app.js"||req.url==="/app.css") {res.setHeader("Content-Type",req.url.endsWith("css")?"text/css":"application/javascript");res.end(await readFile(path.join(out,req.url.slice(1))));}
  else res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin=`http://127.0.0.1:${server.address().port}`;
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright");
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
try {
  for(const width of [1440,390]) {
    const page=await browser.newPage({viewport:{width,height:950}});
    const pageErrors=[]; page.on("pageerror",e=>pageErrors.push(e.message));
    await page.route("**/*",r=>r.request().url().startsWith(origin)?r.continue():r.abort());
    await page.addInitScript(payload=>{
      window.mode="initial"; window.fixture=payload; window.calls=[];
      window.fetch=async(url,options={})=>{
        window.calls.push({url,method:options.method||"GET"});
        if(url.endsWith("/receipts"))return Response.json({receipt:null,itemized:null});
        if(url!=="/api/admin/orders")throw Error("Forbidden fixture request "+url);
        if(window.mode==="network")throw TypeError("Failed to fetch");
        if(window.mode==="initial"||window.mode==="failure")return Response.json({error:"Failed to fetch orders",code:"ORDERS_FETCH_FAILED"},{status:500});
        if(window.mode==="malformed")return Response.json({});
        const body=structuredClone(window.fixture);
        if(window.mode==="degraded") {body.recovery_warning="Recovery status unavailable. Recovery actions are disabled until a successful refresh.";body.abandoned[0].recovery_review={state:"unavailable",sentAt:null,ignoredAt:null};}
        if(window.mode==="warning")body.operations_warning="Fixture operational warning";
        return Response.json(body);
      };
    },normalPayload);
    await page.goto(origin);
    await page.getByText("Unable to load orders. Queue contents are unavailable.",{exact:true}).waitFor();
    await page.screenshot({path:path.join(out,`initial-failure-${width}.png`),fullPage:true});
    assert.equal(await page.getByText("No orders in this section.",{exact:true}).count(),0);
    assert.equal(await page.getByText("Loading current order and Stripe status…",{exact:true}).count(),0);
    await page.evaluate(()=>{window.mode="healthy";});
    await page.getByRole("button",{name:"Retry order refresh"}).click();
    await page.getByText("Fixture Customer",{exact:true}).waitFor();
    assert.equal(await page.getByRole("alert").count(),0);
    for(const mode of ["failure","network","malformed"]) {
      await page.evaluate(mode=>{window.mode=mode;window.queueRefresh();},mode);
      await page.getByText("Order refresh failed. Displayed orders may be stale.",{exact:true}).waitFor();
      assert.equal(await page.getByText("Fixture Customer",{exact:true}).count(),1);
      assert.ok((await page.locator("main").innerText()).includes("Active Fixture"));
      if(mode==="network")assert.match(await page.getByRole("alert").innerText(),/Network or connection failure/);
      if(mode==="malformed")assert.match(await page.getByRole("alert").innerText(),/invalid order-list response/);
      await page.evaluate(()=>{window.mode="healthy";});
      await page.getByRole("button",{name:"Retry order refresh"}).click();
      await page.getByRole("alert").waitFor({state:"hidden"});
    }
    await page.evaluate(()=>{window.mode="degraded";window.queueRefresh();});
    await page.getByText("Recovery status unavailable. Recovery actions are disabled until a successful refresh.",{exact:true}).waitFor();
    await page.screenshot({path:path.join(out,`degraded-queue-${width}.png`),fullPage:true});
    assert.equal(await page.getByRole("alert").count(),0);
    await page.getByRole("button").filter({hasText:"Fixture Customer"}).click();
    assert.equal(await page.getByRole("button",{name:"Send recovery email",exact:true}).isEnabled(),false);
    assert.equal(await page.getByRole("button",{name:"Ignore",exact:true}).isEnabled(),false);
    await page.screenshot({path:path.join(out,`degraded-${width}.png`),fullPage:true});
    await page.evaluate(()=>{window.mode="warning";window.queueRefresh();});
    await page.getByText("Fixture operational warning",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Send recovery email",exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Send recovery email",exact:true}).isEnabled(),true);
    assert.equal(await page.getByText("Recovery status unavailable. Recovery actions are disabled until a successful refresh.",{exact:true}).count(),0);
    assert.equal(await page.getByRole("alert").count(),0);
    assert.deepEqual(pageErrors,[]);
    assert.ok((await page.evaluate(()=>window.calls)).every(c=>c.method==="GET"));
    await page.close(); console.log(`PASS real client ${width}px initial/refresh/network/malformed/recovered/degraded/operational-warning`);
  }
} finally {await browser.close(); await new Promise(r=>server.close(r));}
