import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fixture} from '../../src/preview';

const translations=Object.assign({},...['basic','default','admin','pc'].map(name=>
  JSON.parse(readFileSync(`supplier-host/src-tauri/locales/${name}/en.json`,'utf8'))));

async function mockHost(page:Page,password:string|null='739251') {
  const data=fixture('ready');
  data.get_setting_options={...data.get_setting_options as object,device_password:password};
  data.get_stock_list=[{slot:1,row:1,col:1,material_id:'test',goods_id:1,price:0,count:5,disabled:false,model_id:'test',model_name:'Test',state:'idle'}];
  await page.addInitScript(({data,translations})=>{
    const state={data,calls:[] as string[],listeners:{} as Record<number,{event:string;handler:number}>};
    let next=1;const callbacks=new Map<number,(event:unknown)=>void>();
    const w=window as any;w.__hostTest=state;w.isTauri=true;
    w.__hostTest.emit=(event:string,payload:unknown)=>{
      for(const [id,listener] of Object.entries(state.listeners))if(listener.event===event)callbacks.get(listener.handler)?.({event,id:Number(id),payload});
    };
    w.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
    w.__TAURI_INTERNALS__={
      transformCallback(fn:(event:unknown)=>void){const id=next++;callbacks.set(id,fn);return id;},
      unregisterCallback(id:number){callbacks.delete(id);},
      convertFileSrc(){return '';},
      async invoke(command:string,args:Record<string,any>={}){
        state.calls.push(command);
        if(command==='plugin:event|listen'){const id=next++;state.listeners[id]={event:args.event,handler:args.handler};return id;}
        if(command==='plugin:event|unlisten'){delete state.listeners[args.eventId];return;}
        if(command==='get_language_data')return translations;
        if(command==='ui_inited'){
          for(const [id,listener] of Object.entries(state.listeners)){
            if(listener.event==='loading_finished')callbacks.get(listener.handler)?.({event:listener.event,id:Number(id),payload:null});
          }
          for(const item of Object.values(state.data.get_device_info as object))w.__hostTest.emit('device_state_changed',item);
          return;
        }
        if(command in state.data)return (state.data as Record<string,unknown>)[command];
        if(command==='get_setting_configs')return {changed:{}};
        if(command==='get_stock_tpl')return {slot_rows:1,slot_cols:1,slot_volume:10};
        if(command==='get_stock_scanning'||command==='is_fullscreen')return false;
        if(['get_serial_ports','get_system_printers','get_brand_list','get_series_list','get_model_list'].includes(command))return [];
        if(command==='plugin:app|version')return '2.0.1';
        if(command.startsWith('log_')||['set_fullscreen','ui_keyboard_event'].includes(command))return;
        throw Error('Unexpected test IPC: '+command);
      },
    };
  },{data,translations});
}

async function enterPassword(page:Page,password='739251'){
  for(const key of password)await page.locator(`[data-skbtn="${key}"]`).click();
  await page.locator('[data-skbtn="{confirm}"]').click();
}

test('home, password gate, all maintenance pages and return keep a single terminal instance',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await mockHost(page);
  await page.goto('/?lang=en-US');
  await expect(page.locator('.popomo-terminal .qr')).toBeVisible();
  expect(await page.locator('.brand').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=> (window as any).__hostTest.calls.filter((x:string)=>x==='ui_inited').length)).toBe(1);
  const baseline=await page.evaluate(()=>Object.values((window as any).__hostTest.listeners).map((v:any)=>v.event).sort());
  await page.evaluate(()=>location.hash='/admin/system');
  await expect(page).toHaveURL(/#\/$/);
  await page.keyboard.press('F8');
  await expect(page.locator('[data-skbtn="{confirm}"]')).toBeVisible();
  await enterPassword(page,'168168');
  await expect(page.locator('.admin-shell')).toHaveCount(0);
  await enterPassword(page);
  await expect(page.locator('.admin-shell')).toBeVisible();
  await expect(page.locator('.popomo-terminal')).toBeHidden();
  for(const label of ['Payment Settings','Print Settings','Inventory','System']){
    await page.locator('.admin-nav').getByText(label,{exact:true}).click();
    await expect(page.locator('.admin-content')).toBeVisible();
  }
  await page.screenshot({path:'release/qa/supplier-admin.png',fullPage:true});
  await page.locator('.admin-header button').click();
  await expect(page.locator('.popomo-terminal .qr')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Object.values((window as any).__hostTest.listeners).map((v:any)=>v.event).sort())).toEqual(baseline);
  await page.evaluate(()=>location.hash='/admin/system');
  await expect(page).toHaveURL(/#\/$/);
  const calls=await page.evaluate(()=> (window as any).__hostTest.calls as string[]);
  expect(calls.filter(x=>x==='ui_inited')).toHaveLength(1);
  expect(calls.filter(x=>x==='log_error')).toEqual([]);
  expect(calls.filter(x=>/^(save_|start_|select_order_payment|create_order|update_slot)/.test(x))).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({path:'release/qa/supplier-home-portrait.png',fullPage:true});
  await page.setViewportSize({width:1920,height:1080});
  await page.screenshot({path:'release/qa/supplier-home-landscape.png',fullPage:true});
});

test('hardware states and warnings are visible without hiding a valid QR',async({page})=>{
  await mockHost(page);
  await page.addInitScript(()=>{
    const device=(window as any).__hostTest.data.get_device_info;
    device.printer.state='disconnected';device.gripper.state='connecting';device.netproxy.state='connected';
  });
  await page.goto('/?lang=en-US');
  await expect(page.locator('.qr')).toBeVisible();
  await expect(page.locator('[data-device="printer"]')).toContainText('Disconnected');
  await expect(page.locator('[data-device="gripper"]')).toContainText('Connecting');
  await expect(page.locator('[data-device="netproxy"]')).toContainText('Connected');
  const qr=await page.locator('.qr').innerHTML();
  await page.evaluate(()=>{(window as any).__hostTest.emit('print_warning',{warning:'shipping_full'});});
  await expect(page.locator('.device-status-notice')).toContainText('Output tray full');
  await expect(page.locator('.qr')).toBeVisible();
  expect(await page.locator('.qr').innerHTML()).toBe(qr);
  await page.setViewportSize({width:1920,height:1080});
  await page.screenshot({path:'release/qa/supplier-device-status.png',fullPage:true});
  await page.setViewportSize({width:393,height:852});
  await expect(page.locator('.qr')).toBeVisible();
  await expect(page.locator('[data-device="netproxy"]')).toBeVisible();
  expect(await page.locator('.popomo-terminal').evaluate(host=>{
    const root=host.shadowRoot!.querySelector<HTMLElement>('#app')!;return root.scrollWidth<=root.clientWidth;
  })).toBe(true);
  await page.evaluate(()=>{
    const host=(window as any).__hostTest;
    host.emit('device_state_changed',{dtype:'printer',state:'online'});
    host.emit('print_warning',{warning:'none'});
  });
  await expect(page.locator('[data-device="printer"]')).toContainText('Online');
  await expect(page.locator('[data-device="gripper"]')).toContainText('Connecting');
  await expect(page.locator('.device-status-notice')).not.toContainText('Output tray full');
  await page.evaluate(()=>{
    const host=(window as any).__hostTest;host.data.get_machine_info.h5_base_url='javascript:invalid';host.emit('machine_info_changed',{});
  });
  await expect(page.locator('.qr')).toHaveCount(0);
  await expect(page.locator('.scan')).toContainText('The mobile website has not been configured.');
});

test('QR remains visible while awaiting the first device notification',async({page})=>{
  await mockHost(page);
  await page.addInitScript(()=>{(window as any).__hostTest.data.get_device_info={};});
  await page.goto('/?lang=en-US');
  await expect(page.locator('.qr')).toBeVisible();
  for(const key of ['printer','gripper','netproxy'])await expect(page.locator(`[data-device="${key}"]`)).toContainText('Awaiting status');
  await page.evaluate(()=>{(window as any).__hostTest.emit('device_state_changed',{dtype:'gripper',state:'online'});});
  await expect(page.locator('[data-device="gripper"]')).toContainText('Online');
  await expect(page.locator('[data-device="printer"]')).toContainText('Awaiting status');
  await expect(page.locator('.qr')).toBeVisible();
});

test('eight touch-style pointer releases open maintenance; missing password uses supplier default',async({page})=>{
  await mockHost(page,null);await page.goto('/?preview=1&lang=en-US');
  await expect(page.locator('.popomo-terminal .qr')).toBeVisible();
  await expect(page.locator('.preview-bar')).toHaveCount(0);
  for(let i=0;i<7;i++)await page.mouse.click(1060,1900);
  await expect(page.locator('[role="dialog"]')).toHaveAttribute('aria-hidden','true');
  await page.mouse.click(1060,1900);
  await expect(page.locator('[role="dialog"]')).toHaveAttribute('aria-hidden','false');
  await enterPassword(page,'168168');
  await expect(page.locator('.admin-shell')).toBeVisible();
});

test('without a native host the production shell shows a waiting state, never sample data',async({page})=>{
  await page.goto('/?preview=1&mock=1&lang=en-US');
  await expect(page.locator('[data-mock-panel]')).toHaveCount(0);
  await expect(page.locator('.popomo-terminal')).toContainText('Waiting for the terminal app');
  await expect(page.locator('.qr,.preview-bar')).toHaveCount(0);
  await page.keyboard.press('F8');
  await expect(page.locator('[role="dialog"]')).toHaveAttribute('aria-hidden','false');
  await enterPassword(page,'168168');
  await expect(page.locator('.admin-shell')).toHaveCount(0);
});

test('legacy credentials cannot enable payment handoff or cloud polling on the display terminal',async({page})=>{
  const requests:string[]=[];
  await page.route('https://terminal-api.invalid/**',route=>{
    requests.push(route.request().url());
    return route.fulfill({json:{release_enabled:true,orders:[]}});
  });
  await page.clock.install();
  await mockHost(page);
  await page.addInitScript(()=>{
    (window as any).POPOMO_TERMINAL_API={url:'https://terminal-api.invalid',token:'A'.repeat(43)};
  });
  await page.goto('/?lang=en-US');
  await expect(page.locator('.popomo-terminal .qr')).toBeVisible();
  await page.clock.fastForward(31000);
  await expect(page.locator('.popomo-terminal .qr')).toBeVisible();
  const calls=await page.evaluate(()=>(window as any).__hostTest.calls as string[]);
  expect(calls.filter(x=>['get_order_by_id','select_order_payment','create_order'].includes(x))).toEqual([]);
  expect(calls.filter(x=>x==='get_device_info')).toEqual([]);
  expect(requests).toEqual([]);
  expect(calls.filter(x=>x==='get_order_list').length).toBeGreaterThan(1);
});
