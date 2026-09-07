import { NextResponse } from "next/server";
import { hasInternalBearerAuthorization } from "@/lib/internal-auth";
import { runOrderOperations } from "@/lib/orderOperationsServer";
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(request:Request) {
  if(!hasInternalBearerAuthorization(request,process.env.HL_OPERATIONS_SECRET))return NextResponse.json({error:'Unauthorized'},{status:401});
  try {return NextResponse.json(await runOrderOperations(),{headers:{'Cache-Control':'no-store'}});}
  catch {return NextResponse.json({error:'Order operations failed. Check durable operation status.'},{status:503});}
}
