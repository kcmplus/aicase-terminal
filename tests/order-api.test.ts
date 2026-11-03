import test from 'node:test';
import assert from 'node:assert/strict';
import {SupplierOrderApi,OrderOutcomeUnknown,OrderRejected,type OrderTransport,type OrderCommand} from '../src/order-api.ts';
const input={business_number:'business-1',goods_id:123,target_image:'host-returned-target.png',effect_image:'host-returned-effect.png'};
class Host implements OrderTransport{
  callbacks=new Set<(event:unknown)=>void>();calls:Array<{command:OrderCommand;args?:Record<string,unknown>}>=[];
  values:Partial<Record<OrderCommand,unknown>>={generate_business_number:'business-1',download_upload_image:'host-returned-target.png',save_canvas_image:'host-returned-effect.png',get_order_list:[],get_order_by_id:null,get_printable_order:false};
  async invoke(command:OrderCommand,args?:Record<string,unknown>){this.calls.push({command,args});return this.values[command];}
  async listen(_event:'order_created',callback:(payload:unknown)=>void){this.callbacks.add(callback);return ()=>{this.callbacks.delete(callback);};}
  emit(event:unknown){this.callbacks.forEach(callback=>callback(event));}
}
async function until(condition:()=>boolean){for(let i=0;i<100&&!condition();i++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(condition());}
test('integration example: business number, two assets, order-created event and authoritative order query',async()=>{
  const host=new Host(),api=new SupplierOrderApi(host);
  const business_number=await api.generateBusinessNumber();
  const target_image=await api.downloadImage('https://assets.example/print.png',business_number);
  const effect_image=await api.saveImage('example-base64',business_number,'preview.png');
  const result=api.createOrder({business_number,goods_id:123,target_image,effect_image});
  await until(()=>host.calls.some(call=>call.command==='create_order'));
  assert.equal(host.callbacks.size,1);host.emit({business_number,trade_no:'trade-1',errcode:0});
  assert.equal((await result).trade_no,'trade-1');assert.equal(host.callbacks.size,0);
  host.values.get_order_by_id={...input,trade_no:'trade-1',pay_status:'idle',print_status:'idle',status:'none'};
  const order=await api.getOrder('trade-1');assert.equal(order?.pay_status,'idle');assert.equal(await api.hasPrintableOrder(),false);
  assert.deepEqual(host.calls.find(call=>call.command==='create_order')?.args,input);
});
test('acknowledgement is not order success; unrelated or malformed events are ignored',async()=>{
  const host=new Host(),api=new SupplierOrderApi(host);let finished=false;
  const pending=api.createOrder(input).then(result=>{finished=true;return result;});
  await until(()=>host.calls.length===1);
  host.emit({business_number:'other',trade_no:'trade-2',errcode:0});host.emit({business_number:'business-1',errcode:0});
  await new Promise(resolve=>setTimeout(resolve,1));assert.equal(finished,false);
  host.emit({business_number:'business-1',trade_no:'trade-1',errcode:0});await pending;assert.equal(finished,true);
});
test('timeout leaves outcome unknown; repeat calls do not resend; lookup can reconcile',async()=>{
  const host=new Host(),api=new SupplierOrderApi(host,10);await assert.rejects(api.createOrder(input),OrderOutcomeUnknown);
  await assert.rejects(api.createOrder(input),OrderOutcomeUnknown);assert.equal(host.calls.filter(call=>call.command==='create_order').length,1);assert.equal(host.callbacks.size,0);
  assert.throws(()=>api.createOrder({...input,goods_id:456}),/different content/);
  host.values.get_order_list=[{...input,trade_no:'trade-1',pay_status:'idle',print_status:'idle',status:'none',device_password:'secret',target_image:'private-path'}];
  const order=await api.findOrder('business-1');assert.equal(order?.trade_no,'trade-1');assert.ok(!JSON.stringify(order).includes('secret'));assert.ok(!JSON.stringify(order).includes('private-path'));
});
test('supplier rejection preserves error code; command failure is not silently swallowed',async()=>{
  const host=new Host(),api=new SupplierOrderApi(host);
  const pending=api.createOrder(input);await until(()=>host.calls.length===1);host.emit({...input,errcode:10001});
  await assert.rejects(pending,error=>error instanceof OrderRejected&&error.errcode===10001);assert.equal(host.callbacks.size,0);
  const broken=new Host();broken.invoke=async()=>{throw Error('IPC disconnected');};
  await assert.rejects(new SupplierOrderApi(broken).createOrder(input),OrderOutcomeUnknown);assert.equal(broken.callbacks.size,0);
});
test('duplicate submissions share one result and listeners catch events emitted during invoke',async()=>{
  const host=new Host(),invoke=host.invoke.bind(host);host.invoke=async(command,args)=>{if(command==='create_order')host.emit({...input,trade_no:'trade-1',errcode:0});return invoke(command,args);};
  const api=new SupplierOrderApi(host),first=api.createOrder(input),second=api.createOrder({...input});assert.equal(first,second);await first;assert.equal(host.calls.length,1);
});
test('failed subscription never submits; late listener resolution is cleaned up',async()=>{
  const host=new Host();let finish:(cleanup:()=>void)=>void=()=>{},cleaned=false;
  host.listen=()=>new Promise(resolve=>{finish=resolve;});const api=new SupplierOrderApi(host,10);
  await assert.rejects(api.createOrder(input),/timed out/);assert.equal(host.calls.length,0);
  finish(()=>{cleaned=true;});await until(()=>cleaned);
});
test('bad images and inputs stop before creation, using exact vendor argument names',async()=>{
  const host=new Host(),api=new SupplierOrderApi(host);host.values.download_upload_image='';
  await assert.rejects(api.downloadImage('https://assets.example/print.png','business-1'));
  await assert.rejects(api.downloadImage('file:///private/photo.png','business-1'));
  await assert.rejects(api.saveImage('base64','business-1','../target.png'));
  assert.throws(()=>api.createOrder({...input,goods_id:0}));assert.throws(()=>api.createOrder({...input,target_image:''}));
  assert.ok(!host.calls.some(call=>call.command==='create_order'));
});
test('agreed payment uses the confirmed default free, after verification, without creating a second device order',async()=>{
 const host=new Host();host.values.get_order_by_id={...input,trade_no:'trade-1',pay_status:'idle',print_status:'idle',status:'none'};
 let verifications=0;const api=new SupplierOrderApi(host,1000,undefined,async order=>{verifications++;return order.business_number===input.business_number;});
 const first=api.selectExternalPayment('trade-1');assert.equal(first,api.selectExternalPayment('trade-1'));
 assert.deepEqual(await first,{tradeNo:'trade-1',state:'submitted'});assert.equal(verifications,1);
 assert.deepEqual(host.calls.filter(call=>call.command==='select_order_payment'),[{command:'select_order_payment',args:{trade_no:'trade-1',pay_type:'free'}}]);
 assert.ok(!host.calls.some(call=>call.command==='create_order'));
});
test('unverified, refunded, changed and already-paid orders cannot trigger another payment call',async()=>{
 for(const mode of ['no-verifier','denied','refunded','changed','paid']){
  const host=new Host(),row={...input,trade_no:'trade-1',pay_status:'idle',print_status:'idle',status:mode==='refunded'?'refunded':'none'};host.values.get_order_by_id=row;
  const verifier=mode==='no-verifier'?undefined:async()=>{if(mode==='changed')row.business_number='different';if(mode==='paid')row.pay_status='success';return mode!=='denied';};
  const api=new SupplierOrderApi(host,1000,'free',verifier);
  if(mode==='paid')assert.equal((await api.selectExternalPayment('trade-1')).state,'already-paid');
  else await assert.rejects(api.selectExternalPayment('trade-1'));
  assert.ok(!host.calls.some(call=>call.command==='select_order_payment'));
 }
});
test('payment submission timeout does not replay the side effect',async()=>{
 const host=new Host();host.values.get_order_by_id={...input,trade_no:'trade-1',pay_status:'idle',print_status:'idle',status:'none'};
 const invoke=host.invoke.bind(host);host.invoke=async(command,args)=>{const result=await invoke(command,args);if(command==='select_order_payment')return new Promise(()=>{});return result;};
 const api=new SupplierOrderApi(host,10,'free',async()=>true);
 await assert.rejects(api.selectExternalPayment('trade-1'),OrderOutcomeUnknown);await assert.rejects(api.selectExternalPayment('trade-1'),OrderOutcomeUnknown);
 assert.equal(host.calls.filter(call=>call.command==='select_order_payment').length,1);
});
