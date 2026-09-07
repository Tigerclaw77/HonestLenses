import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { supabaseServer as db } from "./supabase-server";
import { sendEmail } from "./email";
import { escapeHtml } from "./email/html";
import { getFounderAlertRecipient } from "./founderAlertConfig";
import { buildAbandonedCheckoutRecoveryEmail } from "./email/recoveryEmail";
import { hashOrderResumeToken, normalizeRecoveryEmail } from "./order-recovery";
import { RECOVERY_ORDER_FIELDS, getVerifiedResumeDestination } from "./recoveryServer";
import { recoveryTouchDue, type RecoveryOrder } from "./recovery";
import { commercialEmailHash, optOutSignature, deliveryToken, nextStuckAlert, shouldNotifyStuck, actionablePaymentStatus, type StuckAlert } from "./orderOperations";
import { isExplicitDraftOrTest } from "./orders/operationalQueue";

type Order=RecoveryOrder & {user_id?:string|null};
type Delivery={id:string;order_id:string;email:string;touch_hours:number;expires_at:string;state:string;customer_name:string|null;postal_address:string|null;first_attempt_at:string|null};
function check(error:unknown) { if(error) throw new Error("Order operations database unavailable",{cause:error}); }
export async function operationsControl() {
  const {data,error}=await db.from("order_operations_control").select("*").eq("id",true).single();check(error);return data;
}
export async function loadOperationsOrders():Promise<Order[]> {
  const all:Order[]=[];
  for(let page=0;;page++) {
    const {data,error}=await db.from("orders").select(`${RECOVERY_ORDER_FIELDS},user_id`).order("id").range(page*500,page*500+499);
    check(error);all.push(...(data??[]));if((data?.length??0)<500)return all;
  }
}
export function replacementOrSuppression(order:Order,all:Order[]) {
  const email=normalizeRecoveryEmail(order.shipping_email??'');
  return all.some(other=> {
    const sameEmail=normalizeRecoveryEmail(other.shipping_email??'')===email;
    if(sameEmail && ['bounced','complained','suppressed'].includes(other.email_delivery_status??''))return true;
    return other.id!==order.id && (sameEmail || Boolean(order.user_id && other.user_id===order.user_id)) &&
      Date.parse(other.created_at??'')>=Date.parse(order.created_at??'') &&
      !['cancelled','canceled','failed'].includes(other.status??'');
  });
}
export async function recoveryEligible(order:Order,all:Order[]) {
  if(!recoveryTouchDue(order)||isExplicitDraftOrTest(order)||replacementOrSuppression(order,all))return false;
  const {data,error}=await db.from("commercial_email_suppressions").select("email_hash").eq("email_hash",commercialEmailHash(order.shipping_email!)).maybeSingle();
  check(error);return !data && Boolean(await getVerifiedResumeDestination(order));
}
export async function processRecovery(order:Order,all:Order[],send:typeof sendEmail=sendEmail,retryTouch?:number) {
  let control=await operationsControl();
  if(!control.recovery_enabled || process.env.RECOVERY_FORCE_DISABLED==='true')return 'disabled';
  if(!control.postal_address?.trim())throw new Error('Recovery postal address required');
  const touch=retryTouch??recoveryTouchDue(order);
  if(!touch)return 'ineligible';
  const lookup=await db.from('recovery_touch_drafts').select('*').eq('order_id',order.id).eq('touch_hours',touch).maybeSingle<Delivery>();check(lookup.error);
  let delivery=lookup.data;
  if(delivery?.state==='sending' && delivery.first_attempt_at && Date.now()-Date.parse(delivery.first_attempt_at)>=23*3_600_000) {
    const result=await db.from('recovery_touch_drafts').update({state:'needs_review',last_error:'Provider outcome uncertain; automatic retry stopped before 24-hour idempotency expiry.'}).eq('id',delivery.id).eq('state','sending');check(result.error);return 'needs_review';
  }
  if(!await recoveryEligible(order,all)) {
    if(delivery && ['sending','pending_founder_approval'].includes(delivery.state)) {
      const result=await db.from('recovery_touch_drafts').update({state:delivery.state==='sending'?'needs_review':'suppressed',last_error:'Order or recipient no longer eligible; sending stopped.'}).eq('id',delivery.id);check(result.error);
    }
    return 'ineligible';
  }
  const uncertain=await db.from('recovery_touch_drafts').select('touch_hours').eq('order_id',order.id).in('state',['sending','needs_review']);check(uncertain.error);
  if(uncertain.data?.some(row=>row.touch_hours!==touch))return 'needs_review';
  const recent=await db.from('recovery_touch_drafts').select('order_id,touch_hours').eq('email',normalizeRecoveryEmail(order.shipping_email!))
    .gte('first_attempt_at',new Date(Date.now()-20*3_600_000).toISOString());check(recent.error);
  if(recent.data?.some(row=>row.order_id!==order.id||row.touch_hours!==touch))return 'frequency_limited';
  if(!delivery) {
    const id=randomUUID(),expires=new Date(Date.now()+7*86_400_000).toISOString();
    const inserted=await db.from('recovery_touch_drafts').insert({id,order_id:order.id,touch_hours:touch,email:normalizeRecoveryEmail(order.shipping_email!),
      expires_at:expires,token_hash:hashOrderResumeToken(deliveryToken(id,expires)),activity_at:order.updated_at??order.created_at,
      customer_name:order.shipping_first_name,postal_address:control.postal_address}).select('*').single<Delivery>();
    if(inserted.error?.code==='23505')return 'duplicate';check(inserted.error);delivery=inserted.data;
  }
  if(!delivery)return 'duplicate';
  if(['sent','suppressed','needs_review'].includes(delivery.state))return delivery.state;
  // Stable payload across provider retries. Existing founder previews become sendable only after activation.
  if(delivery.state==='pending_founder_approval') {
    const result=await db.from('recovery_touch_drafts').update({token_hash:hashOrderResumeToken(deliveryToken(delivery.id,delivery.expires_at)),
      customer_name:order.shipping_first_name,postal_address:control.postal_address}).eq('id',delivery.id).eq('state','pending_founder_approval');check(result.error);
    delivery={...delivery,customer_name:order.shipping_first_name??null,postal_address:control.postal_address};
  }
  const claim=await db.rpc('claim_recovery_delivery',{p_id:delivery.id});check(claim.error);if(!claim.data)return 'duplicate';
  // Refresh both order and replacement facts at the last possible moment before delivery.
  const currentOrders=await loadOperationsOrders();const current=currentOrders.find(o=>o.id===order.id);
  control=await operationsControl();
  if(!control.recovery_enabled || process.env.RECOVERY_FORCE_DISABLED==='true')return 'disabled';
  if(!current || normalizeRecoveryEmail(current.shipping_email??'')!==delivery.email || !await recoveryEligible(current,currentOrders)) {
    const result=await db.from('recovery_touch_drafts').update({state:'suppressed',last_error:'Order, recipient or replacement eligibility changed.'}).eq('id',delivery.id);check(result.error);return 'suppressed';
  }
  const hash=commercialEmailHash(delivery.email);
  const unsubscribe=`https://honestlenses.com/recovery/opt-out?email=${hash}&signature=${optOutSignature(hash)}`;
  const draft=buildAbandonedCheckoutRecoveryEmail({customerName:delivery.customer_name,customerEmail:delivery.email,orderId:order.id,
    resumeUrl:`https://honestlenses.com/resume-order/accept?token=${deliveryToken(delivery.id,delivery.expires_at)}`,
    postalAddress:delivery.postal_address!,unsubscribeUrl:unsubscribe});
  try {
    const sent=await send({to:delivery.email,subject:draft.subject,text:draft.text,html:draft.html,
      idempotencyKey:`recovery:${delivery.id}`,tracking:{orderId:order.id,emailType:'order_recovery'},
      headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}});
    if(!sent.data?.id)throw new Error('Provider did not confirm an email ID');
    const result=await db.from('recovery_touch_drafts').update({state:'sent',sent_at:new Date().toISOString(),provider_id:sent.data.id,last_error:null}).eq('id',delivery.id);check(result.error);
    return 'sent';
  } catch {
    const result=await db.from('recovery_touch_drafts').update({last_error:'Delivery outcome requires retry with the same provider key within 23 hours.'}).eq('id',delivery.id);check(result.error);
    return 'retry_pending';
  }
}

export async function refreshStuckOrder(order:Order,send:typeof sendEmail=sendEmail) {
  const {data:previous,error}=await db.from('order_stuck_alerts').select('*').eq('order_id',order.id).maybeSingle<StuckAlert>();check(error);
  const current={...order};
  if(isExplicitDraftOrTest(order))current.status='draft';
  else if(order.payment_intent_id && ['authorized','captured'].includes(order.status??'')) {
    const intent=await new Stripe(process.env.STRIPE_SECRET_KEY!).paymentIntents.retrieve(order.payment_intent_id,{expand:['latest_charge']});
    if(intent.metadata.order_id!==order.id)throw new Error('Stuck-order payment ownership mismatch');
    const charge=typeof intent.latest_charge==='object'?intent.latest_charge:null;
    current.status=actionablePaymentStatus(intent,charge);
  }
  const next=nextStuckAlert(current,previous);
  const stored=await db.from('order_stuck_alerts').upsert({...next,last_checked_at:new Date().toISOString()});check(stored.error);
  if(!shouldNotifyStuck(next))return;
  // At-most-once notification claim persists before send; ambiguity remains visible, never spammed.
  const claimed=await db.from('order_stuck_alerts').update({notification_claimed_at:new Date().toISOString()}).eq('order_id',order.id).eq('state_key',next.state_key).is('notification_claimed_at',null).select('order_id');check(claimed.error);
  if(!claimed.data?.length)return;
  try {
    const sent=await send({to:getFounderAlertRecipient(),subject:`[Founder] Stuck order: ${order.id}`,
      text:`${next.reason}\nReview: https://honestlenses.com/admin/orders`,
      html:`<p>${escapeHtml(next.reason??'')}</p><p><a href="https://honestlenses.com/admin/orders">Review stuck order</a></p>`,
      idempotencyKey:`stuck:${order.id}:${next.state_since}`});
    if(!sent.data?.id)throw new Error('Founder email was not confirmed');
    const result=await db.from('order_stuck_alerts').update({notified_at:new Date().toISOString(),notification_error:null}).eq('order_id',order.id);check(result.error);
  } catch {
    const result=await db.from('order_stuck_alerts').update({notification_error:'Founder email was not confirmed. Alert remains in Needs Attention; inspect provider before retrying.'}).eq('order_id',order.id);check(result.error);
  }
}
export async function runOrderOperations() {
  const lease=randomUUID();const claim=await db.rpc('try_order_operations_run',{p_lease:lease});check(claim.error);
  if(!claim.data)return {busy:true};
  let failures=0;
  try {
    const orders=await loadOperationsOrders();
    const openAlerts=await db.from('order_stuck_alerts').select('order_id').eq('active',true);check(openAlerts.error);
    const openIds=new Set((openAlerts.data??[]).map(row=>row.order_id));
    const pending=await db.from('recovery_touch_drafts').select('order_id,touch_hours').eq('state','sending');check(pending.error);
    for(const attempt of pending.data??[]) {
      const order=orders.find(o=>o.id===attempt.order_id);
      if(order)try {await processRecovery(order,orders,sendEmail,attempt.touch_hours);}catch{failures++;}
    }
    for(const order of orders) {
      try {
        if(['authorized','captured'].includes(order.status??'') || openIds.has(order.id))await refreshStuckOrder(order);
        if(order.status==='draft')await processRecovery(order,orders);
      } catch {failures++;}
    }
    const result=await db.from('order_operations_control').update({lease_id:null,lease_until:null,
      ...(failures?{last_error:`${failures} order operations failed; inspect provider/schema. Existing alerts retained.`}:{last_succeeded_at:new Date().toISOString(),last_error:null})}).eq('id',true).eq('lease_id',lease);check(result.error);
    if(failures)throw new Error('Some order operations failed');
    return {checked:orders.length,recoveryEnabled:Boolean((await operationsControl()).recovery_enabled)};
  } catch(error) {
    await db.from('order_operations_control').update({lease_until:null,last_error:'Order operations did not complete; existing alerts retained.'}).eq('id',true).eq('lease_id',lease);
    throw error;
  }
}
