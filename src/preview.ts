import type {Bridge,Command} from './domain';
export type Scenario='ready'|'queue'|'printing'|'offline'|'empty'|'locked'|'delivered'|'error';
export function fixture(scenario:Scenario='ready'):Record<string,unknown>{return {
  get_machine_info:{device_id:'401',shop_id:'146',h5_base_url:'https://aicase.chunpat.cc/',contact_person:'',contact_tel:'',is_show_contact_tel:false},
  get_setting_options:{device_id:'401',device_num:'WM-SJK-00179',device_name:'POPOMO',is_lock:scenario==='locked'},
  get_setting_option_config:{show_h5_entry:true},
  get_device_info:Object.fromEntries(['printer','gripper','netproxy'].map(dtype=>[dtype,{dtype,state:scenario==='offline'?'disconnected':'online'}])),
  get_stock_list:[{slot:1,count:scenario==='empty'?0:5,disabled:false,model_id:'iPhone 17'},{slot:2,count:scenario==='empty'?0:4,disabled:false,model_id:'iPhone 16'}],
  get_print_order:scenario==='printing'||scenario==='delivered'?{trade_no:'DEMO-ORDER-0001',business_number:'1793680000000100001',goods_id:82,model_id:'iPhone 17',effect_image:'/preview-images/ocean.webp',pay_status:'success',status:scenario==='delivered'?'success':'polling',print_status:scenario==='delivered'?'deliver_success':'printing'}:null,
  get_print_progress:scenario==='printing'?{progress:46}:null,
  get_order_list:['queue','printing','delivered'].includes(scenario)?[
    {trade_no:'DEMO-ORDER-0001',business_number:'1793680000000100001',goods_id:82,model_id:'iPhone 17',effect_image:'/preview-images/ocean.webp',pay_status:'success',print_status:scenario==='printing'?'printing':scenario==='delivered'?'deliver_success':'idle',status:scenario==='delivered'?'success':'polling'},
    {trade_no:'DEMO-ORDER-0002',business_number:'1793680000000100002',goods_id:83,model_id:'iPhone 16',effect_image:'/preview-images/pet.webp',pay_status:'idle',print_status:'idle',status:'none'},
    {trade_no:'DEMO-ORDER-0003',business_number:'1793680000000100003',goods_id:82,model_id:'iPhone 17',effect_image:'/preview-images/ocean.webp',pay_status:'success',print_status:'idle',status:'polling'},
    {trade_no:'DEMO-ORDER-0004',business_number:'1793680000000100004',goods_id:83,model_id:'iPhone 16 Pro',effect_image:'/preview-images/cosmos.webp',pay_status:'success',print_status:'idle',status:'polling'},
    {trade_no:'DEMO-ORDER-0005',business_number:'1793680000000100005',goods_id:82,model_id:'iPhone 17 Pro',effect_image:'/preview-images/pet.webp',pay_status:'success',print_status:'idle',status:'polling'},
    {trade_no:'DEMO-ORDER-0098',business_number:'1793680000000100098',goods_id:83,model_id:'iPhone 16',effect_image:'/preview-images/pet.webp',pay_status:'success',print_status:'deliver_success',status:'success'},
    ...(scenario==='queue'?[6,7,8].map(n=>({trade_no:`DEMO-ORDER-000${n}`,business_number:`179368000000010000${n}`,goods_id:82,model_id:'iPhone 17',effect_image:'/preview-images/ocean.webp',pay_status:'success',print_status:'idle',status:'polling'})):[])
  ]:[],
  ui_inited:null
};}
export function previewBridge():Bridge&{setScenario(value:Scenario):void;addOrder():void;confirmArrival(tradeNo:string):boolean}{
  let scenario:Scenario='ready',counter=100;const handlers=new Map<string,Set<()=>void>>();
  let extra:Array<Record<string,unknown>>=[];const confirmed=new Set<string>();
  const changed=()=>handlers.get('order_info_changed')?.forEach(fn=>fn());
  const rows=()=>[...fixture(scenario).get_order_list as Array<Record<string,unknown>>,...extra].map(row=>confirmed.has(String(row.trade_no))?{...row,pay_status:'success',status:'polling'}:row);
  return {
    async invoke(command:Command){if(scenario==='error')throw Error('preview-error');return command==='get_order_list'?rows():fixture(scenario)[command];},
    async listen(event,callback){const listeners=handlers.get(event)||new Set();handlers.set(event,listeners);listeners.add(callback);return ()=>{listeners.delete(callback);};},
    setScenario(value){scenario=value;extra=[];confirmed.clear();handlers.get('machine_info_changed')?.forEach(fn=>fn());},
    addOrder(){counter++;extra.push({trade_no:`DEMO-ORDER-${counter}`,business_number:`17936800000001${counter}`,goods_id:82,model_id:'iPhone 17',effect_image:'/preview-images/ocean.webp',pay_status:'idle',print_status:'idle',status:'none'});changed();},
    confirmArrival(tradeNo){const row=rows().find(row=>row.trade_no===tradeNo);if(!row||row.pay_status!=='idle'||row.print_status!=='idle'||!['none','polling'].includes(String(row.status)))return false;confirmed.add(tradeNo);changed();return true;}
  };
}
