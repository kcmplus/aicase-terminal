import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudOrders,cloudConfig} from '../src/cloud-orders.ts';
import {SupplierOrderApi,type OrderCommand} from '../src/order-api.ts';
import type {Snapshot} from '../src/domain.ts';

const config={url:'https://aicase.example',token:'a'.repeat(43)};
function setup(){
 let snapshot:Snapshot|null={deviceId:'401',shopId:'146',locked:false,showEntry:true,
  ordersAvailable:true,devices:{printer:'online',gripper:'online',netproxy:'online'}} as Snapshot;
 const cloud={reference:'12345678-1234-1234-1234-123456789abc',trade_no:'TRADE1',business_number:'1730000000000123456',
  goods_id:17,release_state:'idle',claim_id:null as string|null};
 const native={trade_no:cloud.trade_no,business_number:cloud.business_number,goods_id:17,
  pay_status:'idle',print_status:'idle',status:'none'};
 const writes:Array<{command:string;args?:Record<string,unknown>}>=[];
 const requests:Array<{url:string;body:any;options:RequestInit}> = [];
 let deny=false,offline=false,ipcFailure=false;
 let afterClaim=()=>{};
 const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 const fetcher:typeof fetch=async(input,options={})=>{
  const url=String(input),body=options.body?JSON.parse(String(options.body)):undefined;
  requests.push({url,body,options});
  if(offline)return response({},503);
  if(url.endsWith('/claim/')){
   const authorized=!deny&&cloud.release_state==='idle';
   if(authorized){cloud.release_state='claimed';cloud.claim_id=body.claim_id;}
   afterClaim();return response({authorized});
  }
  if(url.endsWith('/observe/')){
   assert.equal(body.claim_id,cloud.claim_id);
   if(body.outcome!=='observed')cloud.release_state=body.outcome;
   return response({received:true});
  }
  return response({release_enabled:true,orders:[cloud]});
 };
 const create=()=>new CloudOrders(config,()=>snapshot,verify=>new SupplierOrderApi({
  invoke:async(command:OrderCommand,args?:Record<string,unknown>)=>{
   if(command==='get_order_by_id')return {...native};
   writes.push({command,args});
   if(ipcFailure)throw Error('IPC uncertain');
   native.pay_status='success';return undefined;
  },listen:async()=>()=>{},
 },20,'free',verify),fetcher,()=>crypto.randomUUID());
 return {cloud,native,writes,requests,create,set deny(value:boolean){deny=value;},set offline(value:boolean){offline=value;},
  set ipcFailure(value:boolean){ipcFailure=value;},set snapshot(value:Snapshot|null){snapshot=value;},
  get snapshot(){return snapshot;},set afterClaim(value:()=>void){afterClaim=value;}};
}
test('only HTTPS runtime configuration is accepted; query credentials are never used',()=>{
 assert.deepEqual(cloudConfig(config),config);
 for(const url of ['http://aicase.example','https://aicase.example/?token=x','https://user:pass@aicase.example','https://aicase.example/path'])assert.equal(cloudConfig({...config,url}),null);
 assert.equal(cloudConfig({...config,token:'short'}),null);
});
test('one server claim releases the existing order with free and reports acknowledgement',async()=>{
 const f=setup(),runner=f.create();await runner.tick();
 assert.deepEqual(f.writes,[{command:'select_order_payment',args:{trade_no:'TRADE1',pay_type:'free'}}]);
 assert.equal(f.cloud.release_state,'submitted');
 const claim=f.requests.find(r=>r.url.endsWith('/claim/'))!;
 assert.equal(claim.body.goods_id,17);
 assert.equal(claim.options.credentials,'omit');
 assert.equal((claim.options.headers as Record<string,string>).Authorization,'Bearer '+config.token);
 assert.ok(f.requests.every(r=>!r.url.includes(config.token)));
});
test('reconnect, overlapping polling and a new process never replay a claimed order',async()=>{
 const f=setup(),runner=f.create();await Promise.all([runner.tick(),runner.tick()]);
 await runner.tick();runner.dispose();await f.create().tick();
 assert.equal(f.writes.length,1);
 assert.equal(f.requests.filter(r=>r.url.endsWith('/claim/')).length,1);
 assert.ok(f.requests.some(r=>r.body?.outcome==='observed'));
});
test('unavailable or denied server verification cannot call the native payment command',async()=>{
 const f=setup();f.deny=true;await f.create().tick();assert.equal(f.writes.length,0);
 f.offline=true;await f.create().tick();assert.equal(f.writes.length,0);
});
test('a mismatched native order or an offline/locked device cannot be released',async()=>{
 const f=setup();f.native.business_number='other';await f.create().tick();
 assert.equal(f.requests.filter(r=>r.url.endsWith('/claim/')).length,0);
 f.native.business_number=f.cloud.business_number;f.snapshot={...f.snapshot!,locked:true};await f.create().tick();
 assert.equal(f.writes.length,0);
});
test('changing device identity during verification prevents the payment command',async()=>{
 const f=setup();f.afterClaim=()=>{f.snapshot={...f.snapshot!,deviceId:'402'};};await f.create().tick();
 assert.equal(f.writes.length,0);
 assert.equal(f.cloud.release_state,'claimed');
});
test('uncertain IPC is reported once and only observed after restart',async()=>{
 const f=setup();f.ipcFailure=true;await f.create().tick();
 assert.equal(f.cloud.release_state,'unknown');assert.equal(f.writes.length,1);
 await f.create().tick();assert.equal(f.writes.length,1);
});
