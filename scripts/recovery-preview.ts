// Read-only inventory; never creates capabilities, mutates orders, or sends mail.
import { supabaseServer } from "../src/lib/supabase-server";
import { loadOperationsOrders, recoveryEligible, operationsControl } from "../src/lib/orderOperationsServer";
import { recoveryTouchDue } from "../src/lib/recovery";
async function main() {
  const orders=await loadOperationsOrders();
  const counts={hour1:0,hour24:0,excluded:0,alreadyDrafted:0};
  for(const order of orders.filter(o=>o.status==='draft')) {
    const touch=recoveryTouchDue(order);
    if(!touch || !await recoveryEligible(order,orders)){counts.excluded++;continue;}
    const {data,error}=await supabaseServer.from('recovery_touch_drafts').select('id').eq('order_id',order.id).eq('touch_hours',touch).maybeSingle();
    if(error)throw error;
    if(data)counts.alreadyDrafted++;else counts[touch===1?'hour1':'hour24']++;
  }
  console.log(JSON.stringify({mode:'read_only',sendingEnabled:Boolean((await operationsControl()).recovery_enabled),...counts}));
}
void main().catch(()=>{console.error('Recovery preview failed; check schema/provider access. No messages sent.');process.exitCode=1;});
