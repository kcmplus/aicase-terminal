import test from 'node:test';
import assert from 'node:assert/strict';
import {designUrl,snapshot,unavailable,events,type Bridge,type Command} from '../src/domain.ts';
import {fixture} from '../src/preview.ts';
import {TerminalController,type View} from '../src/controller.ts';

function raw(scenario:Parameters<typeof fixture>[0]='ready'){
 const f=fixture(scenario);return {machine:f.get_machine_info,device:f.get_device_info,options:f.get_setting_options,features:f.get_setting_option_config,stock:f.get_stock_list,order:f.get_print_order,progress:f.get_print_progress};
}
test('native identity and stock are validated; sensitive supplier fields are discarded',()=>{
 const input=raw();Object.assign(input.machine as object,{contact_person:'private',contact_tel:'hidden'});Object.assign(input.options as object,{device_password:'secret'});
 const result=snapshot(input);assert.equal(result.deviceId,'401');assert.equal(result.stockCount,9);assert.equal(result.modelCount,2);assert.equal(result.contact,'');
 assert.ok(!JSON.stringify(result).includes('secret'));assert.ok(!JSON.stringify(result).includes('hidden'));
 (input.options as Record<string,unknown>).device_id='400';assert.throws(()=>snapshot(input),/identity-changed/);
});
test('malformed states, counts, progress and duplicate slots fail closed',()=>{
 for(const change of [
  (r:ReturnType<typeof raw>)=>{(r.device as any).printer.state='ready';},
  (r:ReturnType<typeof raw>)=>{(r.stock as any[])[0].count=-1;},
  (r:ReturnType<typeof raw>)=>{(r.stock as any[])[1].slot=1;},
  (r:ReturnType<typeof raw>)=>{(r.options as any).is_lock='false';},
  (r:ReturnType<typeof raw>)=>{r.order={print_status:'printing'};r.progress={progress:101};},
 ]){const r=raw();change(r);assert.throws(()=>snapshot(r));}
});
test('QR links use the fixed H5 address and native identity regardless of supplier URL',()=>{
 for(const hostUrl of ['https://vendor.example/path?token=private#other','http://localhost/','javascript:alert(1)','',null,undefined]){
  const input=raw();(input.machine as any).h5_base_url=hostUrl;
  const data=snapshot(input);
  assert.equal(designUrl(data,'en-US'),
    'https://aicase.chunpat.cc/?device_id=401&shop_id=146&lang=en-US#home');
  assert.equal(designUrl(data,'zh-CN'),
    'https://aicase.chunpat.cc/?device_id=401&shop_id=146&lang=zh-CN#home');
 }
 assert.equal(designUrl({deviceId:'402',shopId:'147'},'en-US'),
   'https://aicase.chunpat.cc/?device_id=402&shop_id=147&lang=en-US#home');
 assert.throws(()=>designUrl({deviceId:'401&token=secret',shopId:'146'},'en-US'));
});
test('unavailable stations hide QR; printing is not interpreted as collected',()=>{
 assert.equal(unavailable(snapshot(raw('ready'))),null);assert.equal(unavailable(snapshot(raw('printing'))),null);
 assert.equal(unavailable(snapshot(raw('empty'))),'empty');assert.equal(unavailable(snapshot(raw('locked'))),'paused');assert.equal(unavailable(snapshot(raw('offline'))),'offline');
 const done=snapshot(raw('delivered'));assert.equal(done.printStatus,'deliver_success');assert.ok(!('collected' in done));
});

class Host implements Bridge{
 listeners=new Map<string,(payload?:unknown)=>void>();calls:Command[]=[];data=fixture();
 async invoke(command:Command):Promise<unknown>{this.calls.push(command);if(command==='ui_inited')assert.equal(this.listeners.size,events.length);return this.data[command];}
 async listen(event:string,callback:(payload?:unknown)=>void){this.listeners.set(event,callback);return ()=>{this.listeners.delete(event);};}
 emit(event:string,payload?:unknown){this.listeners.get(event)?.(payload);}
}
async function until(condition:()=>boolean){for(let i=0;i<100&&!condition();i++)await new Promise(resolve=>setTimeout(resolve,1));assert.ok(condition());}
test('listeners precede handshake, stock updates immediately invalidate QR, cleanup removes handlers',async()=>{
 const host=new Host(),views:View[]=[];const app=new TerminalController(host,view=>views.push(view),60000);
 try{await app.start();assert.equal(views.at(-1)?.data?.stockCount,9);
  host.data=fixture('empty');host.emit('stock_info_changed');assert.equal(views.at(-1)?.data,null);
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
test('print warning immediately blocks QR and persists across reads until explicit clear',async()=>{
 const host=new Host(),views:View[]=[];const app=new TerminalController(host,view=>views.push(view),60000);
 try{await app.start();host.emit('print_warning',{warning:'shipping_full'});assert.equal(views.at(-1)?.error,'print-failed');
  await until(()=>views.at(-1)?.data!==null);await app.retry();assert.equal(views.at(-1)?.error,'print-failed');
  host.emit('print_warning',{warning:'none'});assert.equal(views.at(-1)?.error,null);
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
