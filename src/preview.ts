import type {Bridge,Command} from './domain';
export type Scenario='ready'|'printing'|'offline'|'empty'|'locked'|'delivered'|'error';
export function fixture(scenario:Scenario='ready'):Record<string,unknown>{return {
  get_machine_info:{device_id:'401',shop_id:'146',h5_base_url:'https://aicase.chunpat.cc/',contact_person:'',contact_tel:'',is_show_contact_tel:false},
  get_setting_options:{device_id:'401',device_num:'WM-SJK-00179',device_name:'POPOMO',is_lock:scenario==='locked'},
  get_setting_option_config:{show_h5_entry:true},
  get_device_info:Object.fromEntries(['printer','gripper','netproxy'].map(dtype=>[dtype,{dtype,state:scenario==='offline'?'disconnected':'online'}])),
  get_stock_list:[{slot:1,count:scenario==='empty'?0:5,disabled:false,model_id:'iPhone 17'},{slot:2,count:scenario==='empty'?0:4,disabled:false,model_id:'iPhone 16'}],
  get_print_order:scenario==='printing'||scenario==='delivered'?{print_status:scenario==='delivered'?'deliver_success':'printing'}:null,
  get_print_progress:scenario==='printing'?{progress:46}:null,
  ui_inited:null
};}
export function previewBridge():Bridge&{setScenario(value:Scenario):void}{
  let scenario:Scenario='ready';const handlers=new Map<string,Set<()=>void>>();
  return {async invoke(command:Command){if(scenario==='error')throw Error('preview-error');return fixture(scenario)[command];},async listen(event,callback){const listeners=handlers.get(event)||new Set();handlers.set(event,listeners);listeners.add(callback);return ()=>{listeners.delete(callback);};},setScenario(value){scenario=value;handlers.get('machine_info_changed')?.forEach(fn=>fn());}};
}
