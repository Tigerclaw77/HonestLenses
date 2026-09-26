// Isolated real-route/component regression. No env files or live service calls.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire, isBuiltin } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { assertRequiredSchema, readAdminOrderProjections } from "./required-schema.mjs";

// Physical production column names captured on 2026-09-14; no customer data.
const orderColumns = new Set(`id user_id status total_amount_cents currency payment_intent_id created_at updated_at rx price_reason
verification_status revised_total_amount_cents allow_price_decrease allow_price_increase sku manufacturer verification_passed
box_count right_box_count left_box_count total_box_count verification_requested_at verification_completed_at verification_method
verification_notes prescriber_timezone verification_deadline_at passive_deadline verification_sent_at passive_deadline_at
patient_full_name patient_address_line1 patient_address_line2 patient_city patient_state patient_zip prescriber_name prescriber_practice
prescriber_phone prescriber_fax prescriber_email verification_details_submitted_at patient_first_name patient_last_name patient_middle_name
patient_dob allow_lower_price_adjustment prescriber_city prescriber_state rx_upload_path rx_source rx_ocr_raw rx_patient_name rx_dob
rx_lens_brand rx_expiration_date rx_doctor_name rx_doctor_phone rx_status rx_user_modified rx_is_expired patient_name tax_cents
subtotal_cents shipping_cents rx_ocr_meta patient_id shipping_address_id patient_phone shipping_first_name shipping_last_name
shipping_phone shipping_address1 shipping_address2 shipping_city shipping_state shipping_zip shipping_email brand_confidence requires_od_review
od_review_status archived archived_reason archived_at shipping_method fulfillment_status capture_amount_cents capture_adjustment_reason
capture_adjusted_by capture_adjusted_at adjusted_right_box_count adjusted_left_box_count adjusted_total_box_count order_quantity_adjustment_reason
order_quantity_adjusted_by order_quantity_adjusted_at feedback_credit_cents feedback_credit_applied_at feedback_reason feedback_notes
feedback_survey_shown_at feedback_survey_completed_at email_delivery_status email_last_event email_last_event_at email_failure_reason
email_delivery_requires_attention confirmation_email_sent_at confirmation_email_delivered_at payment_attempt_generation admin_notes
vision_insurance_carrier customer_order_number`.split(/\s+/));
for (const [name, projection] of Object.entries(readAdminOrderProjections())) {
  for (const field of projection.split(",")) assert.ok(orderColumns.has(field), `${name}: column orders.${field} does not exist`);
}
await assert.rejects(assertRequiredSchema({from: table => ({select: fields => ({limit: async limit => {
  assert.equal(limit, 0);
  return {error: table === "orders" && fields.split(",").includes("verification_sent_at")
    ? {code:"42703",message:"fixture admin-only column missing"} : null};
}})})}), /fixture admin-only column missing/);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminPageSource = await readFile(path.join(projectRoot, "src/app/admin/orders/page.tsx"), "utf8");
assert.doesNotMatch(adminPageSource, /30_000/);
assert.match(adminPageSource, /10 \* 60 \* 1000/);
assert.match(adminPageSource, /table: "order_events"/);
assert.match(adminPageSource, /getAuthoritativeOrderQuantity/);
assert.match(adminPageSource, /getStoredEyeQuantityPresence/);
const sourceRoot = path.join(projectRoot, "src");
const testOutputDir = path.join(projectRoot, "output/admin-queue-reliability-tests");
const require = createRequire(import.meta.url);
const moduleExtensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"];

function resolveModulePath(basePath) {
  for (const extension of moduleExtensions) {
    const candidate = `${basePath}${extension}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }

  for (const extension of moduleExtensions.slice(1)) {
    const candidate = path.join(basePath, `index${extension}`);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }

  return null;
}

function isolatedResolverPlugin(mocks = {}) {
  return {
    name: "isolated-services",
    setup(buildContext) {
      buildContext.onResolve({ filter: /.*/ }, (args) => {
        if (Object.hasOwn(mocks, args.path)) {
          return { path: args.path, namespace: "mock" };
        }

        if (args.path.startsWith("@/")) {
          const resolved = resolveModulePath(path.join(sourceRoot, args.path.slice(2)));
          return resolved ? { path: resolved } : undefined;
        }

        if (args.path.startsWith("./") || args.path.startsWith("../")) {
          const importerDirectory = args.importer
            ? path.dirname(args.importer)
            : args.resolveDir;
          const resolved = resolveModulePath(path.resolve(importerDirectory, args.path));
          return resolved ? { path: resolved } : undefined;
        }

        if (isBuiltin(args.path)) {
          return { path: args.path, external: true };
        }

        try {
          return { path: require.resolve(args.path) };
        } catch {
          return undefined;
        }
      });

      buildContext.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
        contents: mocks[args.path],
        loader: "jsx",
        resolveDir: projectRoot,
      }));
    },
  };
}

async function main() {
await rm(testOutputDir, { recursive: true, force: true });
const out = testOutputDir;
await mkdir(out, { recursive: true });
const queueRefreshPath = path.join(sourceRoot, "lib/admin/queueRefresh.ts");
await build({
  stdin: {
    contents: await readFile(queueRefreshPath, "utf8"),
    loader: "ts",
    sourcefile: queueRefreshPath,
    resolveDir: path.dirname(queueRefreshPath),
  },
  outfile:path.join(out,"refresh.mjs"),bundle:true,platform:"node",format:"esm",
  plugins:[isolatedResolverPlugin()],
});
const { createQueueRefresh } = await import(pathToFileURL(path.join(out,"refresh.mjs")));
const order = {
  id:"00000000-0000-4000-8000-000000000001", status:"draft", fulfillment_status:"review",
  verification_status:"unverified", sku:"VITA_12", shipping_email:"fixture@example.test",
  shipping_first_name:"Fixture", shipping_last_name:"Customer", total_amount_cents:20998,
  right_box_count:1, left_box_count:1, total_box_count:2, box_count:2,
  created_at:new Date().toISOString(), updated_at:new Date().toISOString(),
  payment_intent_id:"pi_fixture", rx:{right:{coreId:"VITA",sphere:-2},expires:"2099-01-01"},
};
const activeOrder = {...order,id:"00000000-0000-4000-8000-000000000002",status:"authorized",verification_status:"verified",
  shipping_first_name:"Active",shipping_last_name:"Fixture",shipping_email:"fixture@invalid.invalid",payment_intent_id:"pi_active",
  rx:{
    right:{coreId:"VITA",sphere:1.75,add:"MED",base_curve:8.4,diameter:14},
    left:{coreId:"VITA",sphere:2,add:"MED",base_curve:8.4,diameter:14},
    expires:"2026-12-29",
  }};
let failure = "";
let fixtureOrders = [order, activeOrder];
let fixtureEvents = [];
function projectResult(result, columns, rowId, single) {
  if (result.error || !Array.isArray(result.data)) return result;
  const rows = result.data.filter(row => !rowId || row.id === rowId).map(row => columns === "*" ? {...row}
    : Object.fromEntries(columns.split(",").map(field => [field.trim(), row[field.trim()] ?? null])));
  return {...result, data: single ? rows[0] ?? null : rows};
}
let primaryResults = null;
let auxiliaryResults = {};
const abortSignals = [];
const serviceCalls = [];
globalThis.__queueTestDb = {from(table) {
  let columns, head, rowId, single = false;
  const query = {
    select(c, options) { columns=c; head=options?.head; return query; },
    order() { return query; }, eq(field, value) { if (table === "orders" && field === "id") rowId = value; return query; }, in() { return query; },
    maybeSingle() { single = true; return query; },
    abortSignal(signal) { abortSignals.push(signal); return query; },
    then(resolve, reject) {
      const name = table === "orders" ? "orders" : table === "order_events" ? "activity" : head ? "count" : "review";
      serviceCalls.push(name);
      if (table === "orders" && columns !== "*") {
        const missing = columns.split(",").find(field => !orderColumns.has(field));
        if (missing) return Promise.resolve({data:null,error:{code:"42703",message:`column orders.${missing} does not exist`},status:400}).then(resolve,reject);
      }
      if (auxiliaryResults[name]?.length) {
        const next=auxiliaryResults[name].shift();
        return next === "hang" ? new Promise(()=>{}) : Promise.resolve(next).then(resolve,reject);
      }
      if (name === "orders" && primaryResults?.length) return Promise.resolve(projectResult(primaryResults.shift(),columns,rowId,single)).then(resolve,reject);
      if (failure === `${name}_throw`) return Promise.reject(new Error("Network fetch failed")).then(resolve,reject);
      const result = failure === name ? {data:null,count:null,error:{message:"Gateway Timeout",code:"PGRST003"},status:504}
        : {data:table === "orders" ? fixtureOrders : table === "order_events" ? fixtureEvents : [], count:0,error:null,status:200};
      assert.ok(columns);
      return Promise.resolve(projectResult(result,columns,rowId,single)).then(resolve,reject);
    },
  };
  return query;
}};
globalThis.__queueTestStripe = id => { serviceCalls.push("stripe"); return {id,status:id==="pi_active"?"requires_capture":"requires_payment_method",amount:20998,amount_received:0,created:1789160000}; };
globalThis.__queueTestReconcile = ({order}) => { serviceCalls.push("reconcile"); return {status:order.status,changed:false,eventLogged:true}; };
const ordersRoutePath = path.join(sourceRoot, "app/api/admin/orders/route.ts");
await build({stdin:{contents:await readFile(ordersRoutePath,"utf8"),loader:"ts",sourcefile:ordersRoutePath,resolveDir:path.dirname(ordersRoutePath)},outfile:path.join(out,"route.mjs"),bundle:true,platform:"node",format:"esm",
  define:{"process.env.STRIPE_SECRET_KEY":'"fixture-only"'},
  plugins:[isolatedResolverPlugin({
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
// Schema-accurate results must preserve queue classification and derived values.
const phoneAt = "2026-09-13T12:00:00.000Z", faxAt = "2026-09-13T13:00:00.000Z";
fixtureOrders = [order, {...activeOrder, rx_ocr_raw:{text:"detail-only OCR"}},
  {...activeOrder, id:"00000000-0000-4000-8000-000000000003", admin_notes:"Internal experiment"}];
fixtureEvents = [
  {order_id:activeOrder.id,event_type:"verification_phone_attempted",created_at:phoneAt},
  {order_id:activeOrder.id,event_type:"verification_fax_attempted",created_at:faxAt},
];
const projectionResponse = await GET(new Request("http://fixture.test/api/admin/orders"));
assert.equal(projectionResponse.status, 200);
const projectionPayload = await projectionResponse.json();
const ready = projectionPayload.ready_to_order.find(row => row.id === activeOrder.id);
assert.ok(ready, "structured Rx order remains ready to place after projection");
assert.equal(ready.rx.right.coreId, activeOrder.rx.right.coreId);
assert.equal(ready.rx.right.sphere, activeOrder.rx.right.sphere);
assert.equal(ready.rx.right.add, "MED");
assert.equal(ready.rx.left.add, "MED");
assert.equal(ready.right_box_count, 1);
assert.equal(ready.left_box_count, 1);
assert.equal(ready.total_box_count, 2);
assert.equal(ready.payment_status, "authorized");
assert.equal(ready.verification_phone_attempted_at, phoneAt);
assert.equal(ready.verification_fax_attempted_at, faxAt);
assert.ok(!Object.hasOwn(ready, "rx_ocr_raw"), "bulk list excludes OCR payload");
assert.equal(projectionPayload.abandoned[0].abandoned_checkout.rxMode, "structured_rx");
assert.equal(projectionPayload.archive.find(row => row.admin_notes === "Internal experiment")?.operational_queue.bucket, "draft_or_test");
const detailRoutePath = path.join(sourceRoot, "app/api/admin/orders/[id]/route.ts");
await build({entryPoints:[detailRoutePath],outfile:path.join(out,"detail.mjs"),bundle:true,platform:"node",format:"esm",
  plugins:[isolatedResolverPlugin({
    "next/server":"export const NextResponse={json:(body,init)=>Response.json(body,init)};",
    "@/lib/admin-auth":"export const requireAdminUser=async()=>({ok:true}); export const logAdminAuthFailure=()=>{}; export const adminAuthErrorResponse=()=>{throw Error('unexpected auth failure')};",
    "@/lib/supabase-server":"export const supabaseServer=globalThis.__queueTestDb;",
    "@/lib/payments/adminPaymentReconciliation":"export const getAdminStripe=()=>{throw Error('unexpected Stripe access')}; export const reconcileAdminPaymentState=()=>{throw Error('unexpected reconciliation')};",
  })],
});
const {GET: getDetail} = await import(pathToFileURL(path.join(out,"detail.mjs")));
serviceCalls.length = 0;
const detailResponse = await getDetail(new Request(`http://fixture.test/api/admin/orders/${activeOrder.id}`),{params:Promise.resolve({id:activeOrder.id})});
assert.equal(detailResponse.status, 200);
const detailPayload = await detailResponse.json();
assert.deepEqual(detailPayload.order.rx, activeOrder.rx);
assert.deepEqual(detailPayload.order.rx_ocr_raw, {text:"detail-only OCR"});
assert.deepEqual(serviceCalls, ["orders"], "detail load performs only the order read");

let acceptanceRpcCalls=[];
let acceptanceOrder={id:activeOrder.id,status:"authorized",verification_status:"information_needed",verification_passed:false,rx_status:"automation_review_product_unresolved",rx_source:"ocr_upload",rx:null,rx_upload_path:null,prescriber_name:null,prescriber_email:null,prescriber_phone:null};
globalThis.__acceptTestAuth={ok:true,user:{id:"operator-fixture",email:"operator@example.test"}};
globalThis.__acceptTestDb={
  from(table){assert.equal(table,"orders");const query={select(){return query;},eq(){return query;},async maybeSingle(){return {data:acceptanceOrder,error:null};}};return query;},
  async rpc(name,args){acceptanceRpcCalls.push({name,args});return {data:{order:{...acceptanceOrder,verification_status:"verified",verification_passed:true},already_done:false,event_logged:true},error:null};},
};
const prescriptionRoutePath = path.join(sourceRoot, "app/api/admin/orders/[id]/prescription/route.ts");
await build({entryPoints:[prescriptionRoutePath],outfile:path.join(out,"prescription.mjs"),bundle:true,platform:"node",format:"esm",
  plugins:[isolatedResolverPlugin({
    "next/server":"export const NextResponse={json:(body,init)=>Response.json(body,init)};",
    "@/lib/admin-auth":"export const requireAdminUser=async()=>globalThis.__acceptTestAuth; export const logAdminAuthFailure=()=>{}; export const adminAuthErrorResponse=()=>Response.json({error:'auth required'},{status:401});",
    "@/lib/supabase-server":"export const supabaseServer=globalThis.__acceptTestDb;",
  })],
});
const {POST: acceptPrescription} = await import(pathToFileURL(path.join(out,"prescription.mjs")));
const unconfirmedAcceptance=await acceptPrescription(new Request(`http://fixture.test/api/admin/orders/${activeOrder.id}/prescription`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"accept"})}),{params:Promise.resolve({id:activeOrder.id})});
assert.equal(unconfirmedAcceptance.status,409);
assert.equal((await unconfirmedAcceptance.json()).code,"OPERATOR_CONFIRMATION_REQUIRED");
assert.equal(acceptanceRpcCalls.length,0,"unconfirmed acceptance cannot mutate state");
const confirmedAcceptance=await acceptPrescription(new Request(`http://fixture.test/api/admin/orders/${activeOrder.id}/prescription`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"accept",confirmed:true})}),{params:Promise.resolve({id:activeOrder.id})});
assert.equal(confirmedAcceptance.status,200);
assert.equal((await confirmedAcceptance.json()).order.verification_status,"verified");
assert.deepEqual(acceptanceRpcCalls,[{name:"apply_admin_prescription_acceptance",args:{p_order_id:activeOrder.id,p_actor:"operator@example.test",p_confirmed:true}}]);
acceptanceOrder={...acceptanceOrder,verification_status:"pending",rx_status:null};
const missingEvidenceAcceptance=await acceptPrescription(new Request(`http://fixture.test/api/admin/orders/${activeOrder.id}/prescription`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"accept",confirmed:true})}),{params:Promise.resolve({id:activeOrder.id})});
assert.equal(missingEvidenceAcceptance.status,409);
assert.equal((await missingEvidenceAcceptance.json()).code,"PRESCRIPTION_DECISION_NOT_REVIEWABLE");
assert.equal(acceptanceRpcCalls.length,1,"explicit operator path does not silently approve an order with no reviewable decision");
console.log("PASS explicit authenticated operator acceptance, atomic audit RPC, and missing-evidence guard");
fixtureOrders = [order, activeOrder]; fixtureEvents = [];
console.log("PASS production column contract, projected queue classification, derived fields, and lazy detail Rx/OCR");
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
await build({stdin:{contents:`import {createRoot} from 'react-dom/client'; import Page from '@/app/admin/orders/page'; import '@/styles/globals.css'; createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:projectRoot,loader:"tsx",sourcefile:path.join(projectRoot,"scripts/admin-queue-reliability-browser-entry.tsx")},
  outfile:path.join(out,"app.js"),bundle:true,jsx:"automatic",external:["/*.png"],define:{"process.env.NODE_ENV":'"production"'},
  plugins:[isolatedResolverPlugin({"@/lib/supabase-client":`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})},channel:()=>({on(_e,_f,cb){window.queueRefresh=cb;return this;},subscribe(){return this;}}),removeChannel(){}};`})],
});
const server=createServer(async(req,res)=>{
  if(req.url==="/app.js"||req.url==="/app.css") {res.setHeader("Content-Type",req.url.endsWith("css")?"text/css":"application/javascript");res.end(await readFile(path.join(out,req.url.slice(1))));}
  else res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin=`http://127.0.0.1:${server.address().port}`;
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"playwright-core");
const browserChannel = process.env.BROWSER_CHANNEL || (process.platform === "win32" ? "msedge" : undefined);
const browser=await chromium.launch({headless:true,...(browserChannel?{channel:browserChannel}:{})});
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
        if(url.startsWith("/api/admin/orders/") && url!=="/api/admin/orders"){
          const id=url.split("/").at(-1);
          const order=[...window.fixture.awaiting_verification,...window.fixture.founder_review,...window.fixture.ready_to_order,...window.fixture.resolve_exception,...window.fixture.archive].find(item=>item.id===id);
          return Response.json({order:structuredClone(order)});
        }
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
    const collapsedQuantity = await page.getByTestId("operational-quantity").first().innerText();
    assert.match(collapsedQuantity, /TOTAL BOXES\s+2 boxes\s+OD: 1\s+OS: 1/);
    await page.getByRole("button",{name:"Expand processing for Active Fixture"}).click();
    assert.ok((await page.getByText("MED",{exact:true}).count()) >= 2,"categorical ADD renders for both eyes");
    await page.getByRole("button",{name:"Collapse processing for Active Fixture"}).click();
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

  // Mutation regressions use the real page with authoritative queue/detail
  // responses changing only after the mocked server confirms each action.
  for (const width of [1440, 390]) {
    const page=await browser.newPage({viewport:{width,height:950}});
    const pageErrors=[]; page.on("pageerror",e=>pageErrors.push(e.message));
    await page.route("**/*",r=>r.request().url().startsWith(origin)?r.continue():r.abort());
    await page.addInitScript(payload=>{
      const orderId="00000000-0000-4000-8000-000000000021";
      const classification=(bucket,reasons)=>({bucket,reasons,riskLevel:"normal",paymentStatus:bucket==="ready_to_order"?"captured":"authorized",verificationStatus:bucket==="ready_to_order"?"verified":"information_needed",fulfillmentStatus:bucket==="supplier_managed"?"ordered":bucket==="ready_to_order"?"ready_to_order":"review"});
      const seed=[...payload.awaiting_verification,...payload.founder_review,...payload.ready_to_order,...payload.resolve_exception][0];
      const base={...seed,id:orderId,status:"authorized",verification_status:"information_needed",rx_status:"automation_review_product_unresolved",fulfillment_status:"review",stripe_payment_intent_status:"requires_capture",payment_status:"authorized",payment_intent_id:"pi_mutation_fixture",shipping_first_name:"Mutation",shipping_last_name:"Fixture",prescriber_name:"Dr. Fixture",prescriber_phone:"555-0100",verification_phone_attempted_at:null,operational_queue:classification("founder_review",["Automation requested operator review."])};
      window.detail={...structuredClone(base),rx_ocr_raw:{text:"detail-only OCR"}};
      window.queue={...structuredClone(payload),awaiting_verification:[],founder_review:[structuredClone(base)],ready_to_order:[],resolve_exception:[],archive:[],abandoned:[],integrity_issues:[]};
      window.calls=[];
      window.fetch=async(url,options={})=>{
        const method=options.method||"GET";
        window.calls.push({url,method,body:options.body||null});
        if(url.endsWith("/receipts"))return Response.json({receipt:null,itemized:null});
        if(url==="/api/admin/orders")return Response.json(structuredClone(window.queue));
        if(url===`/api/admin/orders/${orderId}` && method==="GET")return Response.json({order:structuredClone(window.detail)});
        if(url===`/api/admin/orders/${orderId}/verification-attempt` && method==="POST"){
          const attemptedAt="2026-09-15T01:00:00.000Z";
          window.detail.verification_phone_attempted_at=attemptedAt;
          window.queue.founder_review[0].verification_phone_attempted_at=attemptedAt;
          return Response.json({ok:true,method:"phone",attempted_at:attemptedAt});
        }
        if(url===`/api/admin/orders/${orderId}/prescription` && method==="POST"){
          const body=JSON.parse(options.body);
          if(body.confirmed!==true)return Response.json({error:"Explicit operator confirmation is required.",code:"OPERATOR_CONFIRMATION_REQUIRED"},{status:409});
          const current={...window.detail,status:"captured",verification_status:"verified",verification_passed:true,fulfillment_status:"ready_to_order",stripe_payment_intent_status:"succeeded",payment_status:"captured",operational_queue:classification("ready_to_order",["Payment is captured and prescription verification is complete."])};
          window.detail=current;
          window.queue.founder_review=[];
          window.queue.ready_to_order=[structuredClone(current)];
          return Response.json({ok:true,already_done:false,event_logged:true,order:structuredClone(current)});
        }
        if(url===`/api/admin/orders/${orderId}` && method==="PATCH"){
          const current={...window.detail,fulfillment_status:"ordered",operational_queue:classification("supplier_managed",["Supplier order placed; lifecycle tracking owns this order."])};
          window.detail=current;
          window.queue.ready_to_order=[];
          window.queue.archive=[structuredClone(current)];
          return Response.json({ok:true,already_done:false,event_logged:true,order:structuredClone(current),warnings:[]});
        }
        throw Error("Forbidden fixture request "+method+" "+url);
      };
    },normalPayload);
    await page.goto(origin);
    await page.getByText("Mutation Fixture",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Expand processing for Mutation Fixture"}).click();
    await page.getByTitle("Record phone attempt now").click();
    await page.getByText("Prescriber phone attempt recorded.",{exact:true}).waitFor();
    assert.doesNotMatch(await page.getByText("Phone attempted",{exact:true}).locator("..").innerText(),/Not attempted/);

    page.once("dialog",async dialog=>{
      assert.match(dialog.message(),/authenticated decision/);
      await dialog.accept();
    });
    await page.getByRole("button",{name:"Accept prescription",exact:true}).click();
    await page.getByText("Prescription accepted.",{exact:true}).waitFor();
    await page.getByRole("heading",{name:"Ready to Place (1)"}).waitFor();
    assert.equal(await page.getByText("Verified",{exact:true}).count()>0,true);
    assert.equal(await page.getByText("Captured",{exact:true}).count()>0,true);
    assert.equal(await page.getByRole("button",{name:"Accept prescription",exact:true}).count(),0);
    assert.equal(await page.getByRole("button",{name:"Capture payment",exact:true}).count(),0);
    const prescriptionCallIndex=(await page.evaluate(()=>window.calls)).findIndex(call=>call.url.endsWith("/prescription")&&call.method==="POST");
    const callsAfterAcceptance=(await page.evaluate(()=>window.calls)).slice(prescriptionCallIndex+1);
    assert.ok(callsAfterAcceptance.some(call=>call.url==="/api/admin/orders/00000000-0000-4000-8000-000000000021"&&call.method==="GET"));
    assert.ok(callsAfterAcceptance.some(call=>call.url==="/api/admin/orders"&&call.method==="GET"));

    await page.getByRole("button",{name:"Mark supplier order placed",exact:true}).click();
    await page.getByRole("heading",{name:"Ready to Place (0)"}).waitFor();
    await page.getByText("Mutation Fixture",{exact:true}).waitFor();
    assert.deepEqual(pageErrors,[]);
    await page.close();
    console.log(`PASS real client ${width}px verification-attempt/accept/concurrent-capture/queue-move/supplier reconciliation`);
  }

  for (const width of [1440, 390]) {
    const page=await browser.newPage({viewport:{width,height:950}});
    const pageErrors=[]; page.on("pageerror",e=>pageErrors.push(e.message));
    await page.route("**/*",r=>r.request().url().startsWith(origin)?r.continue():r.abort());
    await page.addInitScript(payload=>{
      const orderId="00000000-0000-4000-8000-000000000022";
      const queueClassification={bucket:"founder_review",reasons:["Payment requires reconciliation."],riskLevel:"normal",paymentStatus:"authorized",verificationStatus:"verified",fulfillmentStatus:"review"};
      const readyClassification={bucket:"ready_to_order",reasons:["Payment is captured and prescription verification is complete."],riskLevel:"normal",paymentStatus:"captured",verificationStatus:"verified",fulfillmentStatus:"ready_to_order"};
      const seed=[...payload.awaiting_verification,...payload.founder_review,...payload.ready_to_order,...payload.resolve_exception][0];
      const base={...seed,id:orderId,status:"authorized",verification_status:"verified",fulfillment_status:"review",stripe_payment_intent_status:"requires_capture",payment_status:"authorized",payment_intent_id:"pi_already_captured_fixture",shipping_first_name:"Idempotent",shipping_last_name:"Fixture",operational_queue:queueClassification};
      window.detail=structuredClone(base);
      window.queue={...structuredClone(payload),awaiting_verification:[],founder_review:[structuredClone(base)],ready_to_order:[],resolve_exception:[],archive:[],abandoned:[],integrity_issues:[]};
      window.calls=[];
      window.fetch=async(url,options={})=>{
        const method=options.method||"GET";
        window.calls.push({url,method});
        if(url.endsWith("/receipts"))return Response.json({receipt:null,itemized:null});
        if(url==="/api/admin/orders")return Response.json(structuredClone(window.queue));
        if(url===`/api/admin/orders/${orderId}`&&method==="GET")return Response.json({order:structuredClone(window.detail)});
        if(url===`/api/admin/orders/${orderId}/payment`&&method==="POST"){
          const current={...window.detail,status:"captured",fulfillment_status:"ready_to_order",stripe_payment_intent_status:"succeeded",payment_status:"captured",operational_queue:readyClassification};
          window.detail=current;
          window.queue.founder_review=[];
          window.queue.ready_to_order=[structuredClone(current)];
          return Response.json({ok:true,already_done:true,payment_status:"captured",stripe_payment_intent_status:"succeeded"});
        }
        throw Error("Forbidden fixture request "+method+" "+url);
      };
    },normalPayload);
    await page.goto(origin);
    await page.getByText("Idempotent Fixture",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Expand processing for Idempotent Fixture"}).click();
    await page.getByRole("button",{name:"Capture payment",exact:true}).click();
    await page.getByText("Payment was already captured.",{exact:true}).waitFor();
    await page.getByRole("heading",{name:"Ready to Place (1)"}).waitFor();
    assert.equal(await page.getByText("Captured",{exact:true}).count()>0,true);
    assert.equal(await page.getByRole("button",{name:"Capture payment",exact:true}).count(),0);
    assert.deepEqual(pageErrors,[]);
    await page.close();
    console.log(`PASS real client ${width}px already-captured authoritative reconciliation`);
  }
} finally {await browser.close(); await new Promise(r=>server.close(r));}
}

try {
  await main();
} finally {
  await rm(testOutputDir, { recursive: true, force: true });
}
