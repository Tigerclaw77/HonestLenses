import { NextResponse } from "next/server";
import { hasInternalBearerAuthorization } from "@/lib/internal-auth";
import { runOrderOperations } from "@/lib/orderOperationsServer";
import { runReorderReminders } from "@/lib/reorder/reminders";
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(request:Request) {
  if(!hasInternalBearerAuthorization(request,process.env.HL_OPERATIONS_SECRET))return NextResponse.json({error:'Unauthorized'},{status:401});
  try {
    const operations = await runOrderOperations();
    let reminders;
    try { reminders = await runReorderReminders(); }
    catch (error) {
      console.error("Reorder reminder run failed", error);
      reminders = { enabled: false, error: "Reminder run needs review" };
    }
    return NextResponse.json({ ...operations, reminders }, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch {return NextResponse.json({error:'Order operations failed. Check durable operation status.'},{status:503});}
}
