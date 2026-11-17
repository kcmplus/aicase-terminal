import test from 'node:test';
import assert from 'node:assert/strict';
import {debugValue} from '../src/diagnostics.ts';
import {TerminalController,type View} from '../src/controller.ts';
import {fixture} from '../src/preview.ts';
import type {Bridge} from '../src/domain.ts';

test('debug display masks credentials and bounds large payloads',()=>{
 const value=debugValue({device_password:'private-password',api:{device_mac:'private-token'},orders:[{target_image:'private-image',trade_no:'VISIBLE'}],error:'token=private-token',auth:'Bearer private-auth'}) as any;
 assert.ok(!JSON.stringify(value).includes('private-'));assert.equal(value.orders[0].trade_no,'VISIBLE');
 assert.equal((debugValue(Array(300).fill(1)) as unknown[]).length,201);
 assert.match(String(debugValue('x'.repeat(3000))),/truncated/);
});
test('debug captures interface failures, order totals and invalid events; normal mode exposes none',async()=>{
 for(const debug of [false,true]){
  const data=fixture('queue'),handlers=new Map<string,(payload?:unknown)=>void>();let view:View|undefined;
  const bridge:Bridge={async invoke(command){if(command==='get_stock_list')throw Error('stock unavailable');return data[command];},async listen(event,callback){handlers.set(event,callback);return ()=>{handlers.delete(event);};}};
  const app=new TerminalController(bridge,next=>{view=next;},60000,1000,debug);
  try{await app.start();handlers.get('device_state_changed')?.({unexpected:'event format'});
   if(debug){assert.equal(view?.diagnostics?.ordersTotal,9);assert.equal(view?.diagnostics?.commands.get_stock_list.status,'error');assert.equal(view?.diagnostics?.events[0].name,'device_state_changed');}
   else assert.equal(view?.diagnostics,undefined);
  }finally{app.dispose();}
 }
});

test('debug switch collects only when enabled without another host initialization',async()=>{
 const data=fixture(),calls:string[]=[];let view:View|undefined;
 // Read callback-updated state afresh; assert.equal narrows direct property access to undefined.
 const diagnostics=():View['diagnostics']=>view?.diagnostics;
 const bridge:Bridge={async invoke(command){calls.push(command);return data[command];},async listen(){return ()=>{};}};
 const app=new TerminalController(bridge,next=>{view=next;},60000);
 try{await app.start();assert.equal(diagnostics(),undefined);app.setDebug(true);
  for(let i=0;i<100&&diagnostics()?.commands.get_order_list?.status!=='success';i++)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(diagnostics()?.commands.get_order_list.status,'success');app.setDebug(false);assert.equal(diagnostics(),undefined);
  assert.equal(calls.filter(command=>command==='ui_inited').length,1);
 }finally{app.dispose();}
});
