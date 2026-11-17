import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {snapshot} from '../src/domain.ts';
const session=JSON.parse(readFileSync(new URL('../supplier-host/src/mock/log-session.json',import.meta.url),'utf8'));
test('log fixture contains two actual orders and their recorded printing transitions',()=>{
 assert.equal(session.frames.length,25);
 assert.equal(new Set(session.frames.flatMap((f:any)=>f.orders.map((o:any)=>o.trade_no))).size,2);
 assert.equal(session.machine.device_id,'789');assert.equal(session.machine.shop_id,'351');
 const last=session.frames.at(-1);assert.ok(last.orders.every((o:any)=>o.status==='success'&&o.print_status==='deliver_success'));
 for(const frame of session.frames){
  const data=snapshot({machine:{...session.machine,is_show_contact_tel:false},options:{...session.machine,is_lock:false},features:{show_h5_entry:true},stock:undefined,orders:frame.orders,order:frame.orders.find((o:any)=>o.trade_no===frame.current)||null,progress:null});
  assert.equal(data.ordersRejected,0);assert.equal(data.stockAvailable,false);assert.equal(data.progress,null);
 }
});
test('log fixture is whitelisted and does not ship authentication, contact details or customer image paths',()=>{
 const serialized=JSON.stringify(session);
 for(const forbidden of ['device_password','device_mac','authorization','contact_tel','target_image','/home/','supplier-images/'])assert.ok(!serialized.includes(forbidden),forbidden);
 assert.ok(session.frames.every((f:any)=>f.orders.every((o:any)=>o.effect_image==='')));
});
