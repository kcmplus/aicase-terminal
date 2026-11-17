import test from 'node:test';
import assert from 'node:assert/strict';
import {directBridge} from '../src/direct/bridge';
import {fixture} from '../src/preview';

test('direct bridge reads server orders, keeps identity on disconnect and recovers without fixtures',async()=>{
 const sample=fixture('queue');let calls=0,fail=false;
 const data={simulated:true,machine:sample.get_machine_info,options:sample.get_setting_options,features:sample.get_setting_option_config,stock:[],orders:[{trade_no:'SERVER-ONLY'}],order:null,progress:null};
 const bridge=directBridge((async(_url,init)=>{calls++;assert.equal(init?.method,'POST');if(fail)throw Error('offline');return Response.json(data);}) as typeof fetch);
 try{
  await bridge.invoke('ui_inited');
  assert.deepEqual(await bridge.invoke('get_order_list'),[{trade_no:'SERVER-ONLY'}]);
  await Promise.all([bridge.invoke('get_order_list'),bridge.invoke('get_machine_info')]);
  assert.equal(calls,1);
  fail=true;await new Promise(resolve=>setTimeout(resolve,2100));
  await assert.rejects(bridge.invoke('get_order_list'));
  assert.deepEqual(await bridge.invoke('get_machine_info'),data.machine);
  fail=false;data.orders=[{trade_no:'SERVER-NEW'}];
  await new Promise(resolve=>setTimeout(resolve,2100));
  assert.deepEqual(await bridge.invoke('get_order_list'),[{trade_no:'SERVER-NEW'}]);
 }finally{bridge.dispose();}
});

test('direct bridge fails closed if the backend is not the simulation endpoint',async()=>{
 const bridge=directBridge((async()=>Response.json({orders:[]})) as typeof fetch);
 try{await bridge.invoke('ui_inited');await assert.rejects(bridge.invoke('get_order_list'));}
 finally{bridge.dispose();}
});
