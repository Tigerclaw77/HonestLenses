import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeRecoveryEmail } from "./order-recovery";

function hmac(value: string) {
  const secret=process.env.ORDER_RESUME_TOKEN_SECRET;
  if (!secret) throw new Error("Recovery secret missing");
  return createHmac("sha256",secret).update(value).digest("hex");
}
export const commercialEmailHash=(email:string)=>hmac(`commercial-email:${normalizeRecoveryEmail(email)}`);
export const optOutSignature=(hash:string)=>hmac(`commercial-opt-out:${hash}`);
export function validOptOut(hash:string,signature:string) {
  if (!/^[a-f0-9]{64}$/.test(hash)||!/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature),Buffer.from(optOutSignature(hash)));
}
export const deliveryToken=(id:string,expires:string)=>Buffer.from(hmac(`recovery-delivery:${id}:${expires}`),'hex').toString('base64url');

export function actionablePaymentStatus(intent:{status:string;amount_received:number},charge:{refunded:boolean;amount_refunded:number}|null) {
  if(charge?.refunded || (intent.amount_received>0 && (charge?.amount_refunded??0)>=intent.amount_received))return 'refunded';
  return intent.status==='succeeded'?'captured':intent.status==='requires_capture'?'authorized':'draft';
}

export type StuckOrder = {
  id:string;status?:string|null;fulfillment_status?:string|null;verification_status?:string|null;
  updated_at?:string|null;created_at?:string|null;payment_intent_id?:string|null;
};
export type StuckAlert = {
  order_id:string;state_key:string;state_since:string;reason:string|null;active:boolean;
  acknowledged_until?:string|null;acknowledged_by?:string|null;
  notification_claimed_at?:string|null;notified_at?:string|null;notification_error?:string|null;
};
export function nextStuckAlert(order:StuckOrder, previous:StuckAlert|null, now=new Date()):StuckAlert {
  const key=[order.status,order.fulfillment_status,order.verification_status,order.payment_intent_id].join(':');
  const since=previous?.state_key===key?previous.state_since:(previous?now.toISOString():order.updated_at??order.created_at??now.toISOString());
  const fulfillment=order.fulfillment_status??'review';
  const actionable=['authorized','captured'].includes(order.status??'') && !['completed','delivered','cancelled','canceled'].includes(fulfillment);
  const hours=fulfillment==='shipped'?240:['ordered','backordered'].includes(fulfillment)?72:24;
  const active=actionable && +now-Date.parse(since)>=hours*3_600_000;
  return {...(previous?.state_key===key?previous:{}),order_id:order.id,state_key:key,state_since:since,active,
    reason:active?`${order.status==='captured'?'Paid':'Authorized'} order has remained ${fulfillment} for at least ${hours} hours. Review supplier/verification status; update the order or acknowledge for 24 hours.`:null,
    ...(previous?.state_key!==key?{acknowledged_until:null,acknowledged_by:null,notification_claimed_at:null,notified_at:null,notification_error:null}:{})};
}
export function shouldNotifyStuck(alert:StuckAlert,now=new Date()) {
  return alert.active && !alert.notification_claimed_at && !(alert.acknowledged_until && Date.parse(alert.acknowledged_until)>+now);
}
