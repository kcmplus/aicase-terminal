export type QueueOrder={previewImage:string;tradeNo:string;businessNumber:string;goodsId:number|null;model:string;payStatus:string;printStatus:string;status:string};
export function orderQueue(value:unknown):QueueOrder[]{
  if(!Array.isArray(value))throw Error('invalid-order-list');
  const seen=new Set<string>();
  const text=(value:unknown,max=200)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('invalid-order-list');return value;};
  const optional=(value:unknown,max=200)=>typeof value==='string'&&value.length<=max?value:'';
  return value.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid-order-list');
    const row=value as Record<string,unknown>,tradeNo=text(row.trade_no);
    if(seen.has(tradeNo))throw Error('invalid-order-list');
    seen.add(tradeNo);
    // These are display fields, not authorization inputs. Missing metadata must not hide an order.
    return {previewImage:optional(row.effect_image,8192),tradeNo,businessNumber:optional(row.business_number),goodsId:typeof row.goods_id==='number'&&Number.isSafeInteger(row.goods_id)&&row.goods_id>0?row.goods_id:null,model:optional(row.model_id),payStatus:optional(row.pay_status)||'unknown',printStatus:optional(row.print_status)||'unknown',status:optional(row.status)||'unknown'};
  }); // Preserve the host's sort order. Never sort by our own payment/creation timestamps.
}
export function readOrderQueue(value:unknown){
  const orders:QueueOrder[]=[],seen=new Set<string>();
  let rejected=0;
  if(!Array.isArray(value))return {orders,available:false,total:0,rejected};
  for(const item of value){
    try{const row=orderQueue([item])[0];if(seen.has(row.tradeNo))throw Error('duplicate');seen.add(row.tradeNo);orders.push(row);}
    catch{rejected++;}
  }
  return {orders,available:true,total:value.length,rejected};
}
export function queueState(order:QueueOrder){
  if(order.status==='refunded')return 'refunded';
  if(order.status==='canceled'||order.payStatus==='canceled')return 'cancelled';
  if(order.status==='failed'||order.printStatus.endsWith('_failed')||order.payStatus==='failed'||order.payStatus==='timeouted')return 'failed';
  if(order.printStatus==='deliver_success')return 'delivered';
  if(['grabbing','grab_success','printing','print_success','delivering'].includes(order.printStatus))return 'printing';
  if(order.status==='success')return 'completed';
  if(order.printStatus==='idle'&&order.payStatus==='success')return 'waiting';
  if(order.printStatus==='idle'&&['idle','paying'].includes(order.payStatus))return 'confirmation';
  return 'unknown';
}

// Native current-order status wins over a list fetched during a queue transition.
export function queueGroups(orders:QueueOrder[],current:QueueOrder|null){
  const rows=orders.map(order=>order.tradeNo===current?.tradeNo?current:order);
  if(current&&!rows.some(order=>order.tradeNo===current.tradeNo))rows.unshift(current);
  const active=rows.filter(order=>queueState(order)==='printing');
  return {
    all:rows,
    active,
    waiting:rows.filter(order=>queueState(order)==='waiting'),
    confirmation:rows.filter(order=>queueState(order)==='confirmation'),
    delivered:rows.filter(order=>queueState(order)==='delivered'),
    attention:rows.filter(order=>['failed','unknown'].includes(queueState(order))),
  };
}

// Arrival notices are scoped to a device and survive temporary list-read failures.
// No native payment status proves that an order was paid to our merchant account.
export class OrderArrivals{
  private device='';private initialized=false;private seen=new Set<string>();
  private unread=new Set<string>();
  update(device:string,orders:QueueOrder[],available:boolean){
    if(device!==this.device){this.device=device;this.initialized=false;this.seen.clear();this.unread.clear();}
    if(!available)return;
    const pending=new Set(orders.filter(order=>queueState(order)==='confirmation').map(order=>order.tradeNo));
    for(const row of orders){if(this.initialized&&!this.seen.has(row.tradeNo)&&pending.has(row.tradeNo))this.unread.add(row.tradeNo);this.seen.add(row.tradeNo);}
    for(const id of this.unread)if(!pending.has(id))this.unread.delete(id);
    this.initialized=true;
  }
  ids(){return [...this.unread];}
  acknowledge(id:string){this.unread.delete(id);}
}
