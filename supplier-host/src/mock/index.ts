import {mockIPC, mockWindows} from '@tauri-apps/api/mocks';
import {emit} from '@tauri-apps/api/event';
import {isTauri} from '@tauri-apps/api/core';

const locales = import.meta.glob('../../src-tauri/locales/{basic,default,admin,pc}/{en,zh}.json', {eager:true, import:'default'});
const scenarios = ['ready','queue','printing','delivered','offline','empty','locked'] as const;
type Scenario = typeof scenarios[number];
type Row = Record<string, any>;

/** Development-only browser host. No native calls or business network requests. */
export function installMockHost() {
  if (!import.meta.env.DEV || import.meta.env.VITE_MOCK !== '1' || isTauri()) return;
  let scenario:Scenario = 'ready';
  let counter = 10;
  let extra:number[] = [];
  let fullscreen = false;
  const options = {device_id:'900001',device_num:'MOCK-DEVICE',device_name:'POPOMO MOCK',device_password:'',language:'en',selectable_language:'en,zh',currency_symbol:'$',currency_decimal:2,is_lock:false};
  let configs:Row = {
    app:{app_ver:'2.0.1',update_mode:'manual'},
    api:{h5_base_url:'https://example.invalid/mock',http_api_url:'https://example.invalid',ws_api_url:'wss://example.invalid',username:'mock',password:'',device_mac:'mock-device'},
    changed:{}, option:{show_h5_entry:true,enable_order_queue:true},
    ui:{page_timeout:120,edit_timeout:120,payment_timeout:120},
    print:{work_dir:'',height_enabled:false,print_parallel:false},
    payment:{currency_decimal:2},stock:{slot_rows:1,slot_cols:2},
    net:{},gripper:{host:'',port:0,backend_type:''},vision:{host:'',port:0,backend_type:''},
    printer:{host:'',port:0,bind_host:'',bind_port:0,printer_name:'Mock printer',backend_type:''},
    invoice:{printer_name:'Mock printer'},test:{auto_test:false},
    mdb:{enabled:false,port_name:'',baud_rate:0,resolution:'',card_resolution:'',card_device:'',card_channel:'',card_level:'',backend_type:''},
    me:{enabled:false,install_dir:'',port_name:'',baud_rate:0},
    salo:{enabled:false,port_name:'',baud_rate:0,host:'',port:0,backend_type:''},
    media:{home:{mtype:'image',interval:5000,images:[],videos:[]},inner:{mtype:'image',interval:5000,images:[],videos:[]}},
  };
  let stock = [1,2].map(slot=>({slot,row:1,col:slot,material_id:`mock-${slot}`,goods_id:slot,price:10,count:5,disabled:false,model_id:`mock-${slot}`,model_name:`Mock phone ${slot}`,model_lang_id:`Mock phone ${slot}`,model_body_image:'',scanning:false}));
  const storageKey = 'popomo:dev-mock:v1';
  let scanTarget = {device_id:options.device_id,shop_id:'900001'};
  const validId = (value:unknown):value is string => typeof value==='string' && /^\d{1,40}$/.test(value);
  let storageWarning = '';
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved) {
      if (!saved.configs || typeof saved.configs !== 'object' || !Array.isArray(saved.stock)
          || saved.stock.length !== stock.length || !saved.stock.every((row:Row,index:number)=>
            row.slot === stock[index].slot && Number.isSafeInteger(row.count) && row.count >= 0
            && typeof row.disabled === 'boolean')) throw Error('Invalid saved mock settings');
      // Keep newly introduced defaults when loading settings from an older dev session.
      for (const key of Object.keys(configs)) {
        if (saved.configs[key] && typeof saved.configs[key] === 'object' && !Array.isArray(saved.configs[key])) {
          configs[key] = {...configs[key],...saved.configs[key]};
        }
      }
      stock = saved.stock;
      if(saved.scanTarget && validId(saved.scanTarget.device_id) && validId(saved.scanTarget.shop_id)) {
        scanTarget={device_id:saved.scanTarget.device_id,shop_id:saved.scanTarget.shop_id};
      }
      if(scenarios.includes(saved.scenario))scenario=saved.scenario;
      if(Number.isSafeInteger(saved.counter)&&saved.counter>=10)counter=saved.counter;
      if(Array.isArray(saved.extra)&&saved.extra.every((id:unknown)=>Number.isSafeInteger(id)&&Number(id)>10)) {
        extra=[...new Set<number>(saved.extra)];
        counter=Math.max(counter,...extra);
      }
    }
  } catch {
    storageWarning = '无法读取已保存的模拟设置，已使用默认值';
  }
  const persist = (nextConfigs=configs,nextStock=stock,nextTarget=scanTarget) => {
    try {
      localStorage.setItem(storageKey,JSON.stringify({configs:nextConfigs,stock:nextStock,scanTarget:nextTarget,scenario,counter,extra}));
    } catch (error) {
      status.textContent='保存失败：浏览器本地存储不可用或空间不足';
      throw error;
    }
  };
  const image = new URL('./case.svg?no-inline',import.meta.url).href;
  const order = (id:number,paid=true):Row => ({trade_no:`MOCK-ORDER-${id}`,business_number:`MOCK-${id}`,goods_id:1,model_id:'Mock phone',effect_image:image,pay_status:paid?'success':'idle',status:paid?'polling':'none',print_status:'idle'});
  const orders = () => {
    const rows:Row[] = ['queue','printing','delivered'].includes(scenario) ? [order(1),order(2,false),order(3)] : [];
    if(rows.length && scenario==='printing')rows[0].print_status='printing';
    if(rows.length && scenario==='delivered')Object.assign(rows[0],{print_status:'deliver_success',status:'success'});
    return [...rows,...extra.map(id=>order(id,false))];
  };
  const notify = async () => {
    for(const event of ['machine_info_changed','setting_configs_changed','setting_options_changed','stock_info_changed','order_info_changed'])await emit(event,{});
  };
  const panel=document.createElement('details');
  panel.dataset.mockPanel='true';
  panel.style.cssText='position:fixed;top:8px;right:8px;z-index:99999;padding:10px;background:#fff4cc;color:#222;border:1px solid #a87900;border-radius:8px;font:14px sans-serif;max-width:330px;box-shadow:0 2px 10px #0003';
  const title=document.createElement('summary');title.textContent='MOCK 调试 · 模拟数据';panel.append(title);
  const hint=document.createElement('p');hint.textContent='后台：F8 / 右下角点 8 次；密码 168168。设置保存在当前浏览器，刷新或新开页面仍保留。';panel.append(hint);
  const scanHint=document.createElement('p');scanHint.textContent='扫码联调需填写后台已登记的设备和商家编号。仅改变二维码目标，本页订单和设备状态仍为模拟。';panel.append(scanHint);
  const inputFor=(labelText:string,value:string)=>{
    const label=document.createElement('label');label.style.display='block';label.textContent=labelText;
    const input=document.createElement('input');input.type='text';input.inputMode='numeric';input.maxLength=40;input.value=value;
    input.style.cssText='display:block;width:100%;box-sizing:border-box;margin:4px 0 8px;padding:4px';
    label.append(input);panel.append(label);return input;
  };
  const deviceInput=inputFor('扫码目标 device_id',scanTarget.device_id);
  const shopInput=inputFor('扫码目标 shop_id',scanTarget.shop_id);
  const saveTarget=document.createElement('button');saveTarget.textContent='保存扫码目标';
  const saveScanTarget=async()=>{
    const nextTarget={device_id:deviceInput.value.trim(),shop_id:shopInput.value.trim()};
    if(!validId(nextTarget.device_id)||!validId(nextTarget.shop_id)) {
      status.textContent='设备编号和商家编号必须是 1–40 位数字';return;
    }
    try {
      persist(configs,stock,nextTarget);scanTarget=nextTarget;
      status.textContent='扫码目标已保存；请重新扫码。订单和设备状态仍为模拟。';await notify();
    } catch { /* persist shows the storage error in the panel. */ }
  };
  saveTarget.onclick=saveScanTarget;
  deviceInput.oninput=saveScanTarget;
  shopInput.oninput=saveScanTarget;
  panel.append(saveTarget);
  const select=document.createElement('select');select.setAttribute('aria-label','Mock scenario');
  const labels=['待机','订单队列','打印中','已出货','设备离线','库存为空','设备锁定'];
  scenarios.forEach((value,index)=>select.add(new Option(labels[index],value)));
  select.value=scenario;
  select.onchange=async()=>{
    const before={scenario,extra};scenario=select.value as Scenario;extra=[];
    try {persist();status.textContent='模拟状态已自动保存到当前浏览器';await notify();}
    catch {scenario=before.scenario;extra=before.extra;select.value=scenario;}
  };panel.append(select);
  const add=document.createElement('button');add.textContent='模拟新订单';add.onclick=async()=>{
    extra.push(++counter);
    try {persist();status.textContent='模拟订单已自动保存到当前浏览器';await notify();}
    catch {extra.pop();counter--;}
  };panel.append(add);
  const reset=document.createElement('button');reset.textContent='恢复默认模拟设置';
  reset.onclick=()=>{localStorage.removeItem(storageKey);location.reload();};panel.append(reset);
  const status=document.createElement('p');status.dataset.mockStatus='true';status.textContent=storageWarning || '所有设备操作均为模拟';panel.append(status);
  document.body.append(panel);

  mockWindows('main');
  mockIPC(async (command,payload) => {
    const args=(payload || {}) as Row;
    const clone=(value:unknown)=>structuredClone(value);
    if(command==='get_language_data') {
      const language=String(args.locale).startsWith('zh')?'zh':'en';
      return Object.assign({},...Object.entries(locales).filter(([path])=>path.endsWith(`/${language}.json`)).map(([,value])=>value));
    }
    switch(command) {
      case 'ui_inited': await emit('loading_finished',null); return;
      case 'get_machine_info': return {...scanTarget,h5_base_url:configs.api.h5_base_url,is_show_contact_tel:false};
      case 'get_setting_options': return {...options,device_id:scanTarget.device_id,currency_decimal:configs.payment.currency_decimal,is_lock:scenario==='locked'};
      case 'get_setting_configs': return clone(configs);
      case 'get_setting_option_config': return clone(configs.option);
      case 'get_setting_ui_config': return clone(configs.ui);
      case 'get_setting_print_config': return clone(configs.print);
      case 'get_setting_changed_config': return clone(configs.changed);
      case 'save_setting_configs': {
        const nextConfigs=clone(args.configs) as Row;
        nextConfigs.changed=Object.fromEntries(Object.keys(nextConfigs).filter(key=>key!=='changed').map(key=>[`${key}_changed`,true]));
        persist(nextConfigs);configs=nextConfigs;
        status.textContent='模拟设置已保存到当前浏览器';await notify();return;
      }
      case 'get_device_info': return Object.fromEntries(['printer','gripper','netproxy'].map(dtype=>[dtype,{dtype,state:scenario==='offline'?'disconnected':'online'}]));
      case 'get_stock_tpl': return {slot_rows:1,slot_cols:2,slot_volume:10};
      case 'get_stock_list': return stock.map(row=>({...row,count:scenario==='empty'?0:row.count}));
      case 'get_stock_scanning': return false;
      case 'update_slot_item': {
        const nextStock=structuredClone(stock);
        const row=nextStock.find(item=>item.slot===args.slot);if(!row)throw Error('Unknown mock slot');
        for(const field of ['material_id','price','count','disabled'])if(field in args)(row as Row)[field]=args[field];
        persist(configs,nextStock);stock=nextStock;await notify();return;
      }
      case 'update_slot_count_all': {
        const nextStock=stock.map(row=>({...row,count:Number(args.count)}));
        persist(configs,nextStock);stock=nextStock;await notify();return;
      }
      case 'get_order_list': return orders();
      case 'get_order_size': return orders().length;
      case 'get_order_by_id': return orders().find(row=>row.trade_no===args.trade_no) || null;
      case 'get_print_order': return ['printing','delivered'].includes(scenario)?orders()[0]:null;
      case 'get_print_progress': return scenario==='printing'?{progress:46}:null;
      case 'is_fullscreen': return fullscreen;
      case 'set_fullscreen': fullscreen=Boolean(args.fullscreen);return;
      case 'plugin:app|version': return '2.0.1';
      case 'get_serial_ports': return ['MOCK-COM1'];
      case 'get_system_printers': return ['Mock printer'];
      case 'get_brand_list': case 'get_series_list': case 'get_model_list': case 'get_qrcode_pay_types': return [];
      case 'get_cash_pay_type': case 'get_card_pay_type': case 'get_pickup_pay_type': case 'get_free_pay_type': case 'get_gamecard_pay_type': case 'check_for_update': return null;
      case 'ui_keyboard_event': return;
    }
    if(command.startsWith('log_')) {
      if(command==='log_warn'||command==='log_error')console.warn('[mock host]',args.log);
      return;
    }
    if(['start_clean_nozzle','start_testing_reset','start_testing_all','start_testing_grab','start_testing_print','start_testing_deliver','start_invoice_test','start_batch_test','stop_batch_test','start_scan_stock','cancel_scan_stock'].includes(command)) {
      status.textContent=`模拟操作：${command}（未控制设备）`;return;
    }
    status.textContent=`尚未模拟：${command}`;
    throw Error(`Mock command not implemented: ${command}`);
  }, {shouldMockEvents:true});
  // The embedded homepage detects the host through the same flag as the Tauri API.
  Object.assign(window,{isTauri:true});
}
