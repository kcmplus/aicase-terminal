import test from 'node:test';
import assert from 'node:assert/strict';
import {designUrl,snapshot,unavailable,events,deviceStateUpdate,emptyDeviceStates,type Bridge,type Command} from '../src/domain.ts';
import {fixture} from '../src/preview.ts';
import {TerminalController,type View} from '../src/controller.ts';

function raw(scenario:Parameters<typeof fixture>[0]='ready'){
 const f=fixture(scenario);return {machine:f.get_machine_info,options:f.get_setting_options,features:f.get_setting_option_config,stock:f.get_stock_list,order:f.get_print_order,progress:f.get_print_progress};
}
test('native identity and stock are validated; sensitive supplier fields are discarded',()=>{
 const input=raw();Object.assign(input.machine as object,{contact_person:'private',contact_tel:'hidden'});Object.assign(input.options as object,{device_password:'secret'});
 const result=snapshot(input);assert.equal(result.deviceId,'401');assert.equal(result.stockCount,9);assert.equal(result.modelCount,2);assert.equal(result.contact,'');
 assert.ok(!JSON.stringify(result).includes('secret'));assert.ok(!JSON.stringify(result).includes('hidden'));
 (input.options as Record<string,unknown>).device_id='400';assert.throws(()=>snapshot(input),/identity-changed/);
});
test('malformed counts, progress and duplicate slots fail closed',()=>{
 for(const change of [
  (r:ReturnType<typeof raw>)=>{(r.stock as any[])[0].count=-1;},
  (r:ReturnType<typeof raw>)=>{(r.stock as any[])[1].slot=1;},
  (r:ReturnType<typeof raw>)=>{(r.options as any).is_lock='false';},
  (r:ReturnType<typeof raw>)=>{r.order={print_status:'printing'};r.progress={progress:101};},
 ]){const r=raw();change(r);assert.throws(()=>snapshot(r));}
});
test('QR links use the configured host H5 address and native identity, discarding unrelated parameters',()=>{
 const input=raw();(input.machine as any).h5_base_url='https://store.example/shop?token=private#other';
 const data=snapshot(input);
 assert.equal(designUrl(data,'en-US'),
   'https://store.example/shop?device_id=401&shop_id=146&lang=en-US#home');
 assert.equal(designUrl({...data,storefront:'https://aicase.chunpat.cc/'},'zh-CN'),
   'https://aicase.chunpat.cc/?device_id=401&shop_id=146&lang=zh-CN#home');
 for(const storefront of ['http://127.0.0.1/','http://127.3.2.1/','http://localhost/','http://[::1]/','javascript:alert(1)','https://user:pass@store.example/','']){
  assert.throws(()=>designUrl({...data,storefront},'en-US'));
 }
 assert.throws(()=>designUrl({...data,deviceId:'401&token=secret'},'en-US'));
});
test('only explicit station controls hide QR; hardware status does not block scanning',()=>{
 assert.equal(unavailable(snapshot(raw('ready'))),null);assert.equal(unavailable(snapshot(raw('printing'))),null);
 assert.equal(unavailable(snapshot(raw('empty'))),null);assert.equal(unavailable(snapshot(raw('locked'))),'paused');assert.equal(unavailable(snapshot(raw('offline'))),null);
 const failed=raw();failed.order={print_status:'print_failed'};assert.equal(unavailable(snapshot(failed)),null);
 const disabled=raw();(disabled.features as any).show_h5_entry=false;assert.equal(unavailable(snapshot(disabled)),'paused');
 const done=snapshot(raw('delivered'));assert.equal(done.printStatus,'deliver_success');assert.ok(!('collected' in done));
});

class Host implements Bridge{
 listeners=new Map<string,(payload?:unknown)=>void>();calls:Command[]=[];data=fixture();
 async invoke(command:Command):Promise<unknown>{this.calls.push(command);if(command==='ui_inited')assert.equal(this.listeners.size,events.length);return this.data[command];}
 async listen(event:string,callback:(payload?:unknown)=>void){this.listeners.set(event,callback);return ()=>{this.listeners.delete(event);};}
 emit(event:string,payload?:unknown){this.listeners.get(event)?.(payload);}
}
async function until(condition:()=>boolean){for(let i=0;i<100&&!condition();i++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(condition());}
test('device events accept supplier items and full maps, ignoring invalid and unrelated fields',()=>{
 assert.deepEqual(deviceStateUpdate({dtype:'gripper',state:'connecting'}),{gripper:'connecting'});
 assert.deepEqual(deviceStateUpdate(fixture().get_device_info),{printer:'online',gripper:'online',netproxy:'online'});
 for(const payload of [null,[],{},'online',{dtype:'mdb',state:'online'},{dtype:'printer',state:'ready'},{printer:{dtype:'gripper',state:'online'}}])assert.deepEqual(deviceStateUpdate(payload),{});
});
test('device states are event-only, merge independently and survive ordinary refreshes',async()=>{
 const host=new Host(),views:View[]=[];const app=new TerminalController(host,view=>views.push(view),60000);
 try{
  await app.start();assert.deepEqual(views.at(-1)?.data?.devices,emptyDeviceStates());
  const calls=host.calls.length;
  host.emit('device_state_changed',fixture().get_device_info);
  host.emit('device_state_changed',{dtype:'gripper',state:'disconnected'});
  assert.deepEqual(views.at(-1)?.data?.devices,{printer:'online',gripper:'disconnected',netproxy:'online'});
  assert.equal(host.calls.length,calls);assert.equal(unavailable(views.at(-1)!.data!),null);
  const count=views.length;host.emit('device_state_changed',{dtype:'gripper',state:'broken'});assert.equal(views.length,count);
  await app.refresh();assert.equal(views.at(-1)?.data?.devices.gripper,'disconnected');
  host.emit('machine_info_changed');await until(()=>views.at(-1)?.loading===false);
  assert.equal(views.at(-1)?.data?.devices.gripper,'disconnected');
  assert.ok(!host.calls.some(command=>String(command)==='get_device_info'));
  const callback=host.listeners.get('device_state_changed')!;app.dispose();
  const finalCount=views.length;callback({dtype:'gripper',state:'online'});assert.equal(views.length,finalCount);
 }finally{app.dispose();}
});
test('startup device notifications and updates during reads are retained without another query',async()=>{
 const host=new Host(),views:View[]=[];const original=host.invoke.bind(host);
 let held=false,release:(value:unknown)=>void=()=>{};
 host.invoke=async command=>{
  const value=await original(command);
  if(command==='ui_inited')host.emit('device_state_changed',fixture().get_device_info);
  if(command==='get_machine_info'&&!held){held=true;return new Promise(resolve=>{release=resolve;});}
  return value;
 };
 const app=new TerminalController(host,view=>views.push(view),60000);
 try{
  const started=app.start();await until(()=>held);
  host.emit('device_state_changed',{dtype:'gripper',state:'connecting'});
  release(host.data.get_machine_info);await started;
  assert.deepEqual(views.at(-1)?.data?.devices,{printer:'online',gripper:'connecting',netproxy:'online'});
  assert.ok(!host.calls.some(command=>String(command)==='get_device_info'));
 }finally{app.dispose();}
});
test('listeners precede handshake, stock updates keep scan data while refreshing, cleanup removes handlers',async()=>{
 const host=new Host(),views:View[]=[];const app=new TerminalController(host,view=>views.push(view),60000);
 try{await app.start();assert.equal(views.at(-1)?.data?.stockCount,9);
  host.data=fixture('empty');host.emit('stock_info_changed');assert.equal(views.at(-1)?.data?.stockCount,9);
  await until(()=>views.at(-1)?.data?.stockCount===0);
  assert.ok(host.calls.every(command=>command==='ui_inited'||command.startsWith('get_')));
 }finally{app.dispose();}assert.equal(host.listeners.size,0);
});
test('identity change during read cannot publish old device QR',async()=>{
 const host=new Host(),views:View[]=[];const original=host.invoke.bind(host);
 let release:(value:unknown)=>void=()=>{},held=false;
 host.invoke=async command=>{const value=await original(command);if(command==='get_machine_info'&&!held){held=true;return new Promise(resolve=>{release=resolve;});}return value;};
 const app=new TerminalController(host,view=>views.push(view),60000);
 try{const started=app.start();await until(()=>held);
  (host.data.get_machine_info as any).device_id='402';(host.data.get_setting_options as any).device_id='402';
  host.emit('machine_info_changed');release({...fixture().get_machine_info as object,device_id:'401'});await started;
  assert.equal(views.at(-1)?.data?.deviceId,'402');assert.ok(views.every(view=>view.data?.deviceId!=='401'));
 }finally{app.dispose();}
});
test('timeouts remove stale data and partial listener failures are cleaned up',async()=>{
 const host=new Host(),views:View[]=[];const app=new TerminalController(host,view=>views.push(view),60000,15);
 try{await app.start();host.invoke=()=>new Promise(()=>{});await app.refresh();assert.equal(views.at(-1)?.data,null);assert.equal(views.at(-1)?.error,'connection-failed');}finally{app.dispose();}
 const broken=new Host(),listen=broken.listen.bind(broken);
 broken.listen=async (event,callback)=>{if(event==='device_state_changed')throw Error('not allowed');return listen(event,callback);};
 const failed=new TerminalController(broken,()=>{});await failed.start();assert.equal(broken.listeners.size,0);assert.ok(!broken.calls.includes('ui_inited'));failed.dispose();
});
test('disposing while a listener is pending removes the eventual listener',async()=>{
 const host=new Host();let resolve:(off:()=>void)=>void=()=>{},removed=false;
 host.listen=()=>new Promise(done=>{resolve=done;});
 const app=new TerminalController(host,()=>{},60000,1000);const started=app.start();app.dispose();resolve(()=>{removed=true;});await started;assert.equal(removed,true);assert.equal(host.calls.length,0);
});
test('print warning stays separate from QR errors and persists until explicit clear',async()=>{
 const host=new Host(),views:View[]=[];const app=new TerminalController(host,view=>views.push(view),60000);
 try{await app.start();host.emit('print_warning',{warning:'shipping_full'});assert.equal(views.at(-1)?.error,null);assert.equal(views.at(-1)?.warning,'shipping_full');
  await until(()=>views.at(-1)?.data!==null);await app.retry();assert.equal(views.at(-1)?.error,null);assert.equal(views.at(-1)?.warning,'shipping_full');
  host.emit('print_warning',{warning:'none'});assert.equal(views.at(-1)?.error,null);assert.equal(views.at(-1)?.warning,null);
 }finally{app.dispose();}
});

test('a passive terminal automatically reconnects after initialization failure',async()=>{
 const host=new Host();const listen=host.listen.bind(host);let failed=false,latest:View|undefined;
 host.listen=async(event,callback)=>{if(!failed){failed=true;throw Error('host not ready');}return listen(event,callback);};
 const app=new TerminalController(host,view=>{latest=view;},10,50);
 try{await app.start();assert.equal(latest?.error,'connection-failed');await until(()=>latest?.data?.deviceId==='401');assert.equal(latest?.error,null);}
 finally{app.dispose();}
 assert.equal(host.listeners.size,0);
});
