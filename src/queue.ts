export type QueueOrder={previewImage:string;tradeNo:string;businessNumber:string;goodsId:number;model:string;payStatus:string;printStatus:string;status:string};
export function orderQueue(value:unknown):QueueOrder[]{
  if(!Array.isArray(value)||value.length>5000)throw Error('invalid-order-list');
  const seen=new Set<string>();
  const text=(value:unknown,max=200)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('invalid-order-list');return value;};
  return value.map(value=>{
    if(!value||typeof value!=='object')throw Error('invalid-order-list');
    const row=value as Record<string,unknown>,tradeNo=text(row.trade_no);
    if(seen.has(tradeNo)||typeof row.goods_id!=='number'||!Number.isSafeInteger(row.goods_id)||row.goods_id<=0)throw Error('invalid-order-list');
    seen.add(tradeNo);
    return {previewImage:typeof row.effect_image==='string'&&row.effect_image.length<=8192?row.effect_image:'',tradeNo,businessNumber:text(row.business_number),goodsId:row.goods_id,model:typeof row.model_id==='string'?text(row.model_id):'',payStatus:text(row.pay_status),printStatus:text(row.print_status),status:text(row.status)};
  }); // Preserve the host's sort order. Never sort by our own payment/creation timestamps.
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
