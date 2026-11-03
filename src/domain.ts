export type Language='zh-CN'|'en-US';
export type ConnectionState='disconnected'|'connecting'|'connected'|'online';
export type Snapshot={
  deviceId:string;shopId:string;storefront:string;name:string;number:string;
  contact:string;locked:boolean;showEntry:boolean;
  devices:Record<'printer'|'gripper'|'netproxy',ConnectionState>;
  modelCount:number;stockCount:number;printStatus:string|null;progress:number|null;
};
export type Command='get_machine_info'|'get_device_info'|'get_setting_options'|'get_setting_option_config'|'get_stock_list'|'get_print_order'|'get_print_progress'|'ui_inited';
export interface Bridge{invoke(command:Command):Promise<unknown>;listen(event:string,callback:(payload?:unknown)=>void):Promise<()=>void>;}
export const events=['loading_finished','machine_info_changed','device_state_changed','setting_options_changed','setting_configs_changed','setting_lock_changed','stock_info_changed','product_info_changed','order_info_changed','order_print_started','order_print_finished','order_print_status','order_print_progress','print_warning'] as const;
const states=new Set(['disconnected','connecting','connected','online']);
const printStates=new Set(['idle','grabbing','grab_success','grab_failed','printing','print_success','print_failed','delivering','deliver_success','deliver_failed']);
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid-data');return value as Record<string,unknown>;}
function text(value:unknown,max=160):string{if(typeof value!=='string'||value.length>max)throw Error('invalid-data');return value;}
function id(value:unknown):string{const s=text(value,40);if(!/^\d+$/.test(s))throw Error('invalid-identity');return s;}
function bool(value:unknown):boolean{if(typeof value!=='boolean')throw Error('invalid-data');return value;}
function count(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw Error('invalid-data');return value;}
export function snapshot(raw:Record<string,unknown>):Snapshot{
  const machine=record(raw.machine),device=record(raw.device),options=record(raw.options),features=record(raw.features);
  const deviceId=id(machine.device_id),shopId=id(machine.shop_id);
  if(id(options.device_id)!==deviceId)throw Error('identity-changed');
  const devices={} as Snapshot['devices'];
  for(const key of ['printer','gripper','netproxy'] as const){const item=record(device[key]);if(item.dtype!==key||!states.has(String(item.state)))throw Error('invalid-data');devices[key]=item.state as ConnectionState;}
  if(!Array.isArray(raw.stock)||raw.stock.length>10000)throw Error('invalid-data');
  let stockCount=0;const models=new Set<string>(),slots=new Set<number>();
  for(const value of raw.stock){const row=record(value),slot=count(row.slot),quantity=count(row.count),disabled=bool(row.disabled),model=text(row.model_id,100);if(slots.has(slot))throw Error('invalid-data');slots.add(slot);if(!disabled&&quantity>0){if(!model)throw Error('invalid-data');stockCount+=quantity;models.add(model);}}
  let printStatus:string|null=null,progress:number|null=null;
  if(raw.order!==null){const order=record(raw.order);printStatus=text(order.print_status);if(!printStates.has(printStatus))throw Error('invalid-data');}
  if(raw.progress!==null&&printStatus!==null){const data=record(raw.progress);if(typeof data.progress!=='number'||!Number.isFinite(data.progress)||data.progress<0||data.progress>100)throw Error('invalid-data');progress=Math.round(data.progress);}
  // Discard setting passwords, payment amounts, customer/order IDs and local paths.
  return {deviceId,shopId,storefront:text(machine.h5_base_url,2048),name:text(options.device_name),number:text(options.device_num),contact:bool(machine.is_show_contact_tel)?text(machine.contact_tel,80):'',locked:bool(options.is_lock),showEntry:bool(features.show_h5_entry),devices,modelCount:models.size,stockCount,printStatus,progress};
}
export function designUrl(data:Pick<Snapshot,'storefront'|'deviceId'|'shopId'>,language:Language,override=''):string{
  id(data.deviceId);id(data.shopId);
  let url:URL;try{url=new URL(override||data.storefront);}catch{throw Error('invalid-url');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hostname==='localhost'||url.hostname.endsWith('.localhost')||url.hostname==='[::1]'||/^127\./.test(url.hostname)||url.hostname==='0.0.0.0')throw Error('invalid-url');
  url.search=new URLSearchParams({device_id:data.deviceId,shop_id:data.shopId,lang:language}).toString();url.hash='home';return url.href;
}
export function unavailable(data:Snapshot):string|null{
  if(data.locked||!data.showEntry)return 'paused';
  if(Object.values(data.devices).some(value=>value==='disconnected'||value==='connecting'))return 'offline';
  if(data.stockCount===0)return 'empty';
  if(data.printStatus?.endsWith('_failed'))return 'print-failed';
  return null;
}
