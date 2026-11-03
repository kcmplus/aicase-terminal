import test from 'node:test';
import assert from 'node:assert/strict';
import {orderQueue,queueState,queueGroups,OrderArrivals} from '../src/queue.ts';
import {fixture,previewBridge} from '../src/preview.ts';
import {TerminalController,type View} from '../src/controller.ts';
import type {Bridge} from '../src/domain.ts';

test('queue preserves supplier sorting and strips unrelated photos and payment details',()=>{
 const rows=fixture('queue').get_order_list as any[];rows[0].picture='private';rows[0].amount=100;
 const result=orderQueue([rows[2],rows[0],rows[1]]);
 assert.deepEqual(result.map(order=>order.tradeNo),['DEMO-ORDER-0003','DEMO-ORDER-0001','DEMO-ORDER-0002']);
 assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!('amount' in result[0]));
 assert.equal(queueState(result[0]),'waiting');assert.equal(queueState(result[2]),'confirmation');
 assert.equal(queueState({...result[0],status:'refunded'}),'refunded');assert.equal(queueState({...result[0],printStatus:'deliver_success'}),'delivered');
 assert.equal(queueState({...result[0],printStatus:'print_success'}),'printing');
});
test('duplicate IDs and malformed native lists are rejected',()=>{
 const row=(fixture('queue').get_order_list as any[])[0];
 for(const value of [null,{},[row,row],[{...row,trade_no:''}],[{...row,goods_id:'82'}]])assert.throws(()=>orderQueue(value));
});
test('order list reads fail independently of the QR identity and inventory',async()=>{
 const fixtureData=fixture('queue');let view:View|undefined;
 const bridge:Bridge={async invoke(command){if(command==='get_order_list')throw Error('temporarily unavailable');return fixtureData[command];},async listen(){return ()=>{};}};
 const controller=new TerminalController(bridge,value=>{view=value;},60000);
 try{await controller.start();assert.equal(view?.error,null);assert.equal(view?.data?.deviceId,'401');assert.equal(view?.data?.ordersAvailable,false);assert.deepEqual(view?.data?.orders,[]);}finally{controller.dispose();}
});

test('dashboard excludes unconfirmed and finished orders from waiting and preserves native ordering',()=>{
 const rows=orderQueue(fixture('printing').get_order_list);
 const current=orderQueue([fixture('printing').get_print_order])[0];
 const groups=queueGroups(rows,current);
 assert.deepEqual(groups.waiting.map(row=>row.tradeNo),['DEMO-ORDER-0003','DEMO-ORDER-0004','DEMO-ORDER-0005']);
 assert.equal(groups.active.length,1);assert.equal(groups.confirmation.length,1);assert.equal(groups.delivered.length,1);
 const stale=rows.map(row=>row.tradeNo===current.tradeNo?{...row,printStatus:'idle'}:row);
 assert.equal(queueGroups(stale,current).waiting.length,3);
 assert.equal(queueGroups(rows.filter(row=>row.tradeNo!==current.tradeNo),current).active.length,1);
 const finished=rows.map(row=>({...row,status:'refunded'}));
 assert.equal(queueGroups(finished,null).waiting.length,0);
});
test('progress is suppressed when the device switches orders during its read',async()=>{
 const data=fixture('printing');let reads=0,view:View|undefined;
 const bridge:Bridge={async invoke(command){
  if(command==='get_print_order')return {...data.get_print_order as object,trade_no:++reads===1?'JOB-A':'JOB-B'};
  return data[command];
 },async listen(){return ()=>{};}};
 const app=new TerminalController(bridge,next=>{view=next;},60000);
 try{await app.start();assert.equal(view?.data?.currentOrder?.tradeNo,'JOB-B');assert.equal(view?.data?.progress,null);
 await app.refresh();assert.equal(view?.data?.progress,46);
 }finally{app.dispose();}
});

test('new-arrival alerts deduplicate refreshes, survive read failures and reset for a different device',()=>{
 const tracker=new OrderArrivals(),row=orderQueue(fixture('printing').get_order_list)[1];
 tracker.update('146/401',[row],true);assert.deepEqual(tracker.ids(),[]);
 const next={...row,tradeNo:'new-order'};
 tracker.update('146/401',[row,next],true);assert.deepEqual(tracker.ids(),['new-order']);
 tracker.update('146/401',[],false);assert.deepEqual(tracker.ids(),['new-order']);
 tracker.acknowledge('new-order');tracker.update('146/401',[row,next],true);assert.deepEqual(tracker.ids(),[]);
 tracker.update('146/402',[row,next],true);assert.deepEqual(tracker.ids(),[]);
 tracker.update('146/402',[row,next,{...next,tradeNo:'third'}],true);assert.deepEqual(tracker.ids(),['third']);
 tracker.update('146/402',[row,next,{...next,tradeNo:'third',payStatus:'success'}],true);assert.deepEqual(tracker.ids(),[]);
});

test('preview arrival requires explicit confirmation and cannot be confirmed twice',async()=>{
 const host=previewBridge();host.setScenario('printing');
 const before=orderQueue(await host.invoke('get_order_list'));
 host.addOrder();const added=orderQueue(await host.invoke('get_order_list')).find(row=>!before.some(old=>old.tradeNo===row.tradeNo))!;
 assert.equal(queueState(added),'confirmation');
 assert.equal(host.confirmArrival(added.tradeNo),true);
 assert.equal(queueState(orderQueue(await host.invoke('get_order_list')).find(row=>row.tradeNo===added.tradeNo)!), 'waiting');
 assert.equal(host.confirmArrival(added.tradeNo),false);
 assert.equal(host.confirmArrival('missing'),false);
 assert.equal((await host.invoke('get_print_order') as any).trade_no,'DEMO-ORDER-0001');
});
