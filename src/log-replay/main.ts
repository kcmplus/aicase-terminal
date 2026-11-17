import {mountTerminal} from '../terminal';
import type {Bridge} from '../domain';
import session from '../../supplier-host/src/mock/log-session.json';

const handlers=new Map<string,Set<(payload?:unknown)=>void>>();
let index=session.frames.length-1,timer:ReturnType<typeof setInterval>|undefined;
const emit=(event:string,payload?:unknown)=>handlers.get(event)?.forEach(fn=>fn(payload));
const frame=()=>session.frames[index];
const bridge:Bridge={
 async listen(event,callback){const list=handlers.get(event)||new Set();handlers.set(event,list);list.add(callback);return ()=>{list.delete(callback);};},
 async invoke(command){
  const f=frame();
  switch(command){
   case 'ui_inited':emit('device_state_changed',f.devices);return null;
   case 'get_machine_info':return {...session.machine,h5_base_url:'https://example.invalid/log-replay',is_show_contact_tel:false};
   case 'get_setting_options':return {...session.machine,is_lock:false};
   case 'get_setting_option_config':return {show_h5_entry:true};
   case 'get_stock_list':throw Error('原日志未记录 get_stock_list 返回；没有编造库存明细');
   case 'get_print_progress':return null;
   case 'get_print_order':return structuredClone(f.orders.find(row=>row.trade_no===f.current)||null);
   case 'get_order_list':return structuredClone(f.orders);
  }
 }
};
let terminal:ReturnType<typeof mountTerminal>|undefined;
const mount=()=>{terminal?.dispose();terminal=mountTerminal(document.querySelector<HTMLDivElement>('#app')!,{bridge,debug:true,preview:true});};
const toolbar=document.querySelector<HTMLElement>('#replay-controls')!;
const title=document.createElement('h1');title.textContent='真机日志 · 离线网页调试';toolbar.append(title);
const subtitle=document.createElement('p');subtitle.textContent=`${session.source} · 设备 ${session.machine.device_num} · ${new Set(session.frames.flatMap(f=>f.orders.map(o=>o.trade_no))).size} 笔订单 · ${session.frames.length} 个时间节点`;toolbar.append(subtitle);
const controls=document.createElement('div');controls.className='replay-buttons';toolbar.append(controls);
const select=document.createElement('select');select.setAttribute('aria-label','日志时间节点');
for(const [i,f] of session.frames.entries()){const option=document.createElement('option');option.value=String(i);option.textContent=`${f.time} · ${f.label}`;select.append(option);}
controls.append(select);
const button=(label:string,callback:()=>void)=>{const b=document.createElement('button');b.textContent=label;b.onclick=callback;controls.append(b);return b;};
const stop=()=>{clearInterval(timer);timer=undefined;play.textContent='自动播放（每 2 秒一步）';};
const change=(next:number)=>{index=Math.max(0,Math.min(session.frames.length-1,next));select.value=String(index);mount();};
button('上一步',()=>{stop();change(index-1);});button('下一步',()=>{stop();change(index+1);});
const play=button('自动播放（每 2 秒一步）',()=>{if(timer){stop();return;}if(index===session.frames.length-1)change(0);play.textContent='暂停';timer=setInterval(()=>{if(index===session.frames.length-1)stop();else change(index+1);},2000);});
select.onchange=()=>{stop();change(Number(select.value));};select.value=String(index);
const notes=document.createElement('details');notes.open=true;const summary=document.createElement('summary');summary.textContent='数据来源与模拟范围';notes.append(summary);
for(const text of session.notes){const p=document.createElement('p');p.textContent=text;notes.append(p);}toolbar.append(notes);
mount();
window.addEventListener('pagehide',stop);
