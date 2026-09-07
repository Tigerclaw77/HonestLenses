import { validOptOut } from "@/lib/orderOperations";
import { supabaseServer } from "@/lib/supabase-server";
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
function params(request:Request) {const p=new URL(request.url).searchParams;return [p.get('email')??'',p.get('signature')??''];}
export async function GET(request:Request) {
  const [hash,signature]=params(request);
  if(!validOptOut(hash,signature))return new Response('Invalid opt-out link.',{status:400,headers});
  return new Response('<!doctype html><html lang="en"><title>Honest Lenses email preferences</title><h1>Stop commercial emails</h1><p>Order receipts and essential order updates will continue.</p><form method="post"><button type="submit">Unsubscribe</button></form></html>',{headers});
}
export async function POST(request:Request) {
  const [hash,signature]=params(request);
  if(!validOptOut(hash,signature))return new Response('Invalid opt-out link.',{status:400,headers});
  const {error}=await supabaseServer.from('commercial_email_suppressions').upsert({email_hash:hash},{onConflict:'email_hash',ignoreDuplicates:true});
  return new Response(error?'Unable to save your preference. Please retry.':'You are unsubscribed from Honest Lenses commercial emails. Essential order updates will continue.',{status:error?503:200,headers});
}
