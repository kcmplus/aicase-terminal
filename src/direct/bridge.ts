import type {Bridge,Command} from '../domain';

type Payload={simulated:true;machine:unknown;options:unknown;features:unknown;stock:unknown;orders:unknown;order:unknown;progress:unknown};
const keys:Record<Exclude<Command,'ui_inited'>,keyof Payload>={get_machine_info:'machine',get_setting_options:'options',get_setting_option_config:'features',get_stock_list:'stock',get_order_list:'orders',get_print_order:'order',get_print_progress:'progress'};

/** The server owns orders and simulated progress. No fixture data or local order writes. */
export function directBridge(fetcher:typeof fetch=fetch,onConnection:(connected:boolean)=>void=()=>{}):Bridge&{dispose():void}{
 const handlers=new Map<string,Set<(payload?:unknown)=>void>>();
 let data:Payload|undefined,healthy=false,disposed=false,started=false,pending:Promise<void>|undefined;
 let timer:ReturnType<typeof setTimeout>|undefined,last='';
 const emit=(event:string,payload?:unknown)=>handlers.get(event)?.forEach(fn=>fn(payload));
 const deviceState=()=>emit('device_state_changed',{netproxy:{dtype:'netproxy',state:healthy?'connected':'disconnected'}});
 const poll=():Promise<void>=>{
  if(pending)return pending;
  pending=(async()=>{
   try{
    const response=await fetcher('/api/v1/debug-terminal/poll/',{method:'POST',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('backend-unavailable');
    const value=await response.json();
    if(value?.simulated!==true||!Array.isArray(value.orders)||!value.machine||!value.options||!value.features)throw Error('invalid-backend-data');
    const image=(row:Record<string,unknown>|null)=>{
     if(row&&typeof row.effect_image==='string'&&/^\/api\/v1\/debug-terminal\/orders\/[a-f0-9-]+\/preview\.png$/.test(row.effect_image)){
      row.effect_image=new URL(row.effect_image,globalThis.location?.origin||'http://localhost').href;
     }
    };
    value.orders.forEach(image);image(value.order);
    if(disposed)return;
    const changed=JSON.stringify(value)!==last,wasHealthy=healthy;
    data=value;healthy=true;last=JSON.stringify(value);onConnection(true);deviceState();
    if(changed||!wasHealthy)emit('order_info_changed');
   }catch{
    if(disposed)return;
    const wasHealthy=healthy;healthy=false;onConnection(false);deviceState();
    if(wasHealthy)emit('order_info_changed');
   }finally{
    pending=undefined;
    if(!disposed)timer=setTimeout(()=>void poll(),2000);
   }
  })();
  return pending;
 };
 return {
  async invoke(command){
   if(!started){started=true;await poll();}else if(pending&&!data){await pending;}
   if(command==='ui_inited'){deviceState();return null;}
   // Keep the station QR readable during a transient loss of connection, but
   // never label cached order/progress information as a successful fresh read.
   const identity=['get_machine_info','get_setting_options','get_setting_option_config'].includes(command);
   if(!data||(!healthy&&!identity))throw Error('直连后端暂时无法连接');
   return structuredClone(data[keys[command]]);
  },
  async listen(event,callback){const list=handlers.get(event)||new Set();handlers.set(event,list);list.add(callback);return ()=>{list.delete(callback);};},
  dispose(){disposed=true;clearTimeout(timer);handlers.clear();}
 };
}
