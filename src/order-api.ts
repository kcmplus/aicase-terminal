// Historical supplier order IPC adapter. Neither terminal entry imports this module.
// Customer confirmation / payment handoff now belongs to H5 and its server.
// The current flow creates orders through the cloud API. Local creation helpers below
// are retained only for reference/integration tests and are not called by the kiosk.
export type OrderCommand='generate_business_number'|'download_upload_image'|'save_canvas_image'|'create_order'|'get_order_list'|'get_order_by_id'|'get_printable_order'|'select_order_payment';
export interface OrderTransport{
  invoke(command:OrderCommand,args?:Record<string,unknown>):Promise<unknown>;
  listen(event:'order_created',callback:(payload:unknown)=>void):Promise<()=>void>;
}
export type CreateOrderInput={business_number:string;goods_id:number;target_image:string;effect_image:string};
export type OrderCreated={business_number:string;trade_no:string;errcode:0};
export type OrderRecord={business_number:string;trade_no:string;goods_id:number;pay_status:string;print_status:string;status:string};
export type ExternalPaymentVerifier=(order:OrderRecord)=>Promise<boolean>;
export const DEFAULT_EXTERNAL_PAYMENT_TYPE='free'; // Confirmed by the user; supplier IPC declares pay_type as string.
export class OrderOutcomeUnknown extends Error{
  constructor(){super('Order result is unknown. Query this business number before deciding what to do next.');this.name='OrderOutcomeUnknown';}
}
export class OrderRejected extends Error{
  constructor(readonly errcode:number){super(`Supplier rejected the order (${errcode}).`);this.name='OrderRejected';}
}
function text(value:unknown):string{if(typeof value!=='string'||!value.trim()||value.length>8192)throw Error('Invalid supplier value');return value;}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid supplier response');return value as Record<string,unknown>;}
function goods(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<=0)throw Error('Invalid goods ID');return value;}
function order(value:unknown):OrderRecord{const row=record(value);return {business_number:text(row.business_number),trade_no:text(row.trade_no),goods_id:goods(row.goods_id),pay_status:text(row.pay_status),print_status:text(row.print_status),status:text(row.status)};}
function deadline<T>(pending:Promise<T>,ms:number):Promise<T>{
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Supplier request timed out')),ms);pending.then(result=>{clearTimeout(timer);resolve(result);},error=>{clearTimeout(timer);reject(error);});});
}
export class SupplierOrderApi{
  // An ambiguous/successful submission stays recorded for this process. There is no auto-replay.
  // Cross-restart idempotency still requires the supplier/server contract.
  private submissions=new Map<string,{input:string;result:Promise<OrderCreated>}>();
  private paymentSubmissions=new Map<string,Promise<{tradeNo:string;state:'submitted'|'already-paid'}>>();
  constructor(private transport:OrderTransport,private timeoutMs=15000,private paymentType=DEFAULT_EXTERNAL_PAYMENT_TYPE,private verifyExternalPayment?:ExternalPaymentVerifier){}
  async generateBusinessNumber(){return text(await deadline(this.transport.invoke('generate_business_number'),this.timeoutMs));}
  async downloadImage(url:string,businessNumber:string){
    const source=new URL(url);if(!['https:','http:'].includes(source.protocol)||source.username||source.password)throw Error('Invalid image URL');
    return text(await deadline(this.transport.invoke('download_upload_image',{url:source.href,business_number:text(businessNumber)}),this.timeoutMs));
  }
  async saveImage(data:string,businessNumber:string,filename:string){
    if(typeof data!=='string'||!data.length)throw Error('Image data is required');
    if(!/^[a-zA-Z0-9_-]+\.(png|jpe?g)$/i.test(filename))throw Error('Invalid image filename');
    // Preserve the supplier's base64 argument exactly; its accepted prefix must be verified on the host.
    return text(await deadline(this.transport.invoke('save_canvas_image',{data,business_number:text(businessNumber),filename}),this.timeoutMs));
  }
  async getOrder(tradeNo:string){const value=await deadline(this.transport.invoke('get_order_by_id',{trade_no:text(tradeNo)}),this.timeoutMs);if(value===null)return null;const result=order(value);if(result.trade_no!==tradeNo)throw Error('Supplier order identity mismatch');return result;}
  async findOrder(businessNumber:string){
    text(businessNumber);const values=await deadline(this.transport.invoke('get_order_list'),this.timeoutMs);
    if(!Array.isArray(values))throw Error('Invalid supplier response');
    const matches=values.map(order).filter(row=>row.business_number===businessNumber);
    if(matches.length>1)throw Error('Duplicate supplier business number');
    return matches[0]??null;
  }
  async hasPrintableOrder(){const value=await deadline(this.transport.invoke('get_printable_order'),this.timeoutMs);if(typeof value!=='boolean')throw Error('Invalid supplier response');return value;}
  selectExternalPayment(tradeNo:string):Promise<{tradeNo:string;state:'submitted'|'already-paid'}>{
    text(tradeNo);
    const existing=this.paymentSubmissions.get(tradeNo);if(existing)return existing;
    const result=this.submitExternalPayment(tradeNo);this.paymentSubmissions.set(tradeNo,result);return result;
  }
  private async submitExternalPayment(tradeNo:string):Promise<{tradeNo:string;state:'submitted'|'already-paid'}>{
    if(!this.verifyExternalPayment)throw Error('External order payment verification is not connected');
    if(!/^[a-zA-Z0-9_-]{1,60}$/.test(this.paymentType))throw Error('Invalid external payment type');
    const before=await this.getOrder(tradeNo);
    if(!before||!['none','polling'].includes(before.status))throw Error('Order cannot enter printing');
    // The callback must consult our server for this exact supplier order, current device,
    // confirmed payment, refund state and customer's print intent. A URL flag is not proof.
    if(await deadline(this.verifyExternalPayment(before),this.timeoutMs)!==true)throw Error('External payment was not verified');
    const current=await this.getOrder(tradeNo);
    if(!current||current.business_number!==before.business_number||current.goods_id!==before.goods_id||!['none','polling'].includes(current.status))throw Error('Order changed during verification');
    if(current.pay_status==='success')return {tradeNo,state:'already-paid'};
    if(current.print_status!=='idle'||current.pay_status!=='idle')throw Error('Order is no longer awaiting payment');
    try{await deadline(this.transport.invoke('select_order_payment',{trade_no:tradeNo,pay_type:this.paymentType}),this.timeoutMs);}
    catch{throw new OrderOutcomeUnknown();}
    // A successful invoke is not proof of payment or printing. Observe get_order_list/events.
    return {tradeNo,state:'submitted'};
  }
  createOrder(input:CreateOrderInput):Promise<OrderCreated>{
    // There is deliberately no lane, pay_type, paid flag or amount argument in this contract.
    const args={business_number:text(input.business_number),goods_id:goods(input.goods_id),target_image:text(input.target_image),effect_image:text(input.effect_image)};
    const signature=JSON.stringify(args),previous=this.submissions.get(args.business_number);
    if(previous){if(previous.input!==signature)throw Error('This business number was already submitted with different content');return previous.result;}
    const result=this.submit(args);this.submissions.set(args.business_number,{input:signature,result});return result;
  }
  private async submit(args:CreateOrderInput):Promise<OrderCreated>{
    let resolveEvent:(value:OrderCreated)=>void=()=>{},rejectEvent:(error:Error)=>void=()=>{};
    const result=new Promise<OrderCreated>((resolve,reject)=>{resolveEvent=resolve;rejectEvent=reject;});
    // An event can arrive while registration itself is resolving.
    void result.catch(()=>{});
    const pending=this.transport.listen('order_created',payload=>{
      if(!payload||typeof payload!=='object')return;
      const event=payload as Record<string,unknown>;
      if(event.business_number!==args.business_number||!Number.isSafeInteger(event.errcode))return;
      if(event.errcode!==0){rejectEvent(new OrderRejected(event.errcode as number));return;}
      if(typeof event.trade_no==='string'&&event.trade_no.trim())resolveEvent({business_number:args.business_number,trade_no:event.trade_no,errcode:0});
    });
    let off:()=>void;
    try{off=await deadline(pending,this.timeoutMs);}catch(error){void pending.then(cleanup=>cleanup(),()=>{});throw error;}
    try{
      // Subscribe before sending; invoke<void> alone is only command acknowledgement.
      return await deadline(Promise.all([this.transport.invoke('create_order',args),result]).then(([,event])=>event),this.timeoutMs);
    }catch(error){if(error instanceof OrderRejected)throw error;throw new OrderOutcomeUnknown();}
    finally{off();}
  }
}
