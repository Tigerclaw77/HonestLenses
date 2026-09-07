import { NextResponse } from "next/server";
import { requireAdminUser,adminAuthErrorResponse } from "@/lib/admin-auth";
import { supabaseServer as db } from "@/lib/supabase-server";
import { operationsControl } from "@/lib/orderOperationsServer";
export async function GET(request:Request) {
  const auth=await requireAdminUser(request);if(!auth.ok)return adminAuthErrorResponse(auth);
  return NextResponse.json(await operationsControl(),{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request) {
  const auth=await requireAdminUser(request);if(!auth.ok)return adminAuthErrorResponse(auth);
  const body=await request.json().catch(()=>({}));
  if(body.action==='disable_recovery') {
    const {error}=await db.from('order_operations_control').update({recovery_enabled:false,recovery_changed_at:new Date().toISOString(),recovery_changed_by:auth.user.id}).eq('id',true);
    return NextResponse.json({ok:!error},{status:error?503:200});
  }
  if(body.action==='enable_recovery' && body.confirmFounderApproval===true && typeof body.postalAddress==='string' && body.postalAddress.trim().length>=10) {
    const {error}=await db.from('order_operations_control').update({recovery_enabled:true,postal_address:body.postalAddress.trim(),recovery_changed_at:new Date().toISOString(),recovery_changed_by:auth.user.id}).eq('id',true);
    return NextResponse.json({ok:!error},{status:error?503:200});
  }
  if(body.action==='acknowledge_stuck' && typeof body.orderId==='string') {
    const {data,error}=await db.from('order_stuck_alerts').update({acknowledged_until:new Date(Date.now()+86_400_000).toISOString(),acknowledged_by:auth.user.id})
      .eq('order_id',body.orderId).eq('active',true).select('order_id');
    return NextResponse.json({ok:!error&&Boolean(data?.length)},{status:error?503:data?.length?200:409});
  }
  return NextResponse.json({error:'Invalid operation'},{status:400});
}
