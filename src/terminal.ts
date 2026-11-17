import QRCode from 'qrcode';
import brandV6 from './assets/kiosk-wordmark.svg?inline';
import {convertFileSrc,isTauri} from '@tauri-apps/api/core';
import {previewSource} from './order-preview';
import {nativeBridge} from './bridge';
import {TerminalController,type View} from './controller';
import {designUrl,unavailable,type Language,type Bridge,type Snapshot} from './domain';
import {queueState,queueGroups,OrderArrivals,type QueueOrder} from './queue';


export interface TerminalOptions {
  bridge?: Bridge;
  preview?: boolean;
  assetBase?: string;
  onView?: (view: View) => void;
  debug?: boolean;
  brandUrl?: string;
}

// One mount owns one display controller and set of DOM listeners.
export function mountTerminal(root: HTMLDivElement, options: TerminalOptions = {}) {
let disposed = false;
let language:Language=import.meta.env.VITE_DEFAULT_LANGUAGE==='zh-CN'?'zh-CN':'en-US';
const initialLanguage=new URLSearchParams(location.search).get('lang');
if(initialLanguage==='zh-CN'||initialLanguage==='en-US')language=initialLanguage;
let view:View={data:null,loading:true,error:null,updatedAt:null},controller:TerminalController|undefined;
const bridge:Bridge|null=options.bridge ?? nativeBridge(),preview=options.preview ?? false;
let statusOpen=false,showDebug=false;
type Sheet='new'|'existing'|'orders'|'help';
let sheet:Sheet|null=null;
const say=(en:string,zh:string)=>language==='zh-CN'?zh:en;
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const scanIcon='<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 12h18"/></svg>';
function qr(url:string){
  const modules=QRCode.create(url,{errorCorrectionLevel:'M'}).modules;let path='';
  for(let y=0;y<modules.size;y++)for(let x=0;x<modules.size;x++)if(modules.data[y*modules.size+x])path+=`M${x+4} ${y+4}h1v1h-1z`;
  return `<svg viewBox="0 0 ${modules.size+8} ${modules.size+8}" role="img" aria-label="${say('Scan to design on your phone','扫码进入手机设计页')}"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="#243e34"/></svg>`;
}
function message(reason:string){
  const messages:Record<string,[string,string]>={
    'host-missing':['Waiting for the terminal app','等待终端连接'],
    'connection-failed':['Reconnecting to this station…','暂时无法读取设备，正在自动重连。'],
    'invalid-url':['The mobile website has not been configured.','手机端入口尚未配置，请联系工作人员。'],
    paused:['This station is temporarily unavailable.','这台设备暂未开放，请联系工作人员。'],
    offline:['This station is reconnecting. Please wait.','设备正在恢复连接，请稍候。'],
    empty:['No cases available at this station right now.','当前设备暂无可用手机壳。'],
    'print-failed':['This station needs assistance.','设备需要工作人员处理。'],
    loading:['Getting your QR code ready…','正在准备二维码…']
  };
  return say(...(messages[reason]||messages['connection-failed']));
}
function printLabel(status:string){return ({idle:say('Waiting','等待中'),grabbing:say('Preparing your case','正在准备手机壳'),grab_success:say('Case prepared','手机壳已准备'),printing:say('Printing in progress','正在打印'),print_success:say('Printed · Preparing delivery','打印完成 · 等待出货'),delivering:say('Delivering your case','正在出货'),deliver_success:say('Case delivered · Please collect','已出货 · 请取走手机壳'),grab_failed:say('Preparation needs assistance','备料异常，请联系工作人员'),print_failed:say('Printing needs assistance','打印异常，请联系工作人员'),deliver_failed:say('Delivery needs assistance','出货异常，请联系工作人员')})[status]||say('Updating','正在更新');}
function orderCode(order:QueueOrder){return esc(order.tradeNo.slice(-6));}
function modelName(order:QueueOrder){return esc(order.model||(order.goodsId?`${say('Product','商品')} #${order.goodsId}`:say('Model unavailable','型号暂缺')));}
function orderStateLabel(order:QueueOrder){
  return ({refunded:say('Refunded','已退款'),cancelled:say('Cancelled','已取消'),failed:say('Exception','异常'),delivered:say('Dispensed','已出货'),printing:printLabel(order.printStatus),completed:say('Completed','已完成'),waiting:say('Queued','排队中'),confirmation:say('Awaiting confirmation','待确认'),unknown:say('Status pending','状态待确认')})[queueState(order)];
}
const failedPreviews=new Map<string,number>();
function orderPreview(order:QueueOrder,large=false){
  const src=previewSource(order.previewImage,{convertLocal:isTauri()?convertFileSrc:undefined,demoBase:preview?location.href:undefined});
  const available=src&&(!failedPreviews.has(src)||Date.now()-failedPreviews.get(src)!>60000);
  const label=say('Order preview','订单预览图');
  return `<span class="order-preview ${large?'preview-large':''} ${available?'':'image-unavailable'}"><span class="preview-fallback" role="img" aria-label="${say('Preview unavailable','暂无预览图')}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m4 18 5-6 4 4 3-3 5 5"/></svg></span>${available?`<img class="order-preview-image" src="${esc(src)}" alt="${label} · ${orderCode(order)}" referrerpolicy="no-referrer" decoding="async" draggable="false">`:''}</span>`;
}
function previewFailed(event:Event){
  const img=event.target;
  if(!(img instanceof HTMLImageElement)||!img.classList.contains('order-preview-image'))return;
  if(failedPreviews.size>200)failedPreviews.clear();failedPreviews.set(img.src,Date.now());
  img.parentElement?.classList.add('image-unavailable');img.remove();
}
root.addEventListener('error',previewFailed,true);
const arrivals=new OrderArrivals();
function deviceStatus(data:Snapshot|null){
  const states:Record<string,[string,string]>={disconnected:['Disconnected','离线'],connecting:['Connecting','连接中'],connected:['Connected','已连接'],online:['Online','在线']};
  const labels=[['printer','Printer','打印机'],['gripper','Gripper','机械臂'],['netproxy','Network / WebSocket','网络 / WebSocket']] as const;
  const cards=labels.map(([key,en,zh])=>{
    const state=data?.devices[key];
    const known=state&&state!=='unknown';
    const tone=!known?'unknown':state==='online'||state==='connected'?'online':'attention';
    return `<div class="device-status-item status-${tone}" data-device="${key}"><span>${say(en,zh)}</span><strong>${known?say(...states[state]):say('Awaiting status','等待状态通知')}</strong></div>`;
  }).join('');
  const notices:string[]=[];
  if(data){
    if(Object.values(data.devices).some(state=>state==='disconnected'||state==='connecting'))notices.push(say('Some device connections are unavailable. Scanning still opens the mobile site.','部分设备尚未连接，仍可扫码打开手机端。'));
    if(!data.stockAvailable)notices.push(say('Inventory unavailable. Retrying automatically.','库存暂时无法读取，正在自动重试。'));
    else if(data.stockCount===0)notices.push(say('No cases currently available.','当前暂无可用手机壳。'));
    if(!data.printAvailable)notices.push(say('Current print unavailable. Retrying automatically.','当前打印状态暂时无法读取，正在自动重试。'));
    else if(data.printStatus&&!data.progressAvailable)notices.push(say('Print progress unavailable.','打印进度暂时无法读取。'));
    if(data.locked)notices.push(say('Station locked.','设备已锁定。'));
    if(!data.showEntry)notices.push(say('Mobile entry disabled in settings.','后台已关闭手机端入口。'));
    if(data.printStatus?.endsWith('_failed'))notices.push(printLabel(data.printStatus));
  }
  if(view.warning){
    const warnings:Record<string,[string,string]>={printer_offline:['Printer offline','打印机离线'],gripper_offline:['Gripper offline','机械臂离线'],shipping_full:['Output tray full','出货仓已满']};
    notices.push(warnings[view.warning]?say(...warnings[view.warning]):say('Device warning — staff assistance needed.','设备告警，请工作人员检查。'));
  }
  return `<section class="device-status-panel" aria-label="${say('Device connections','设备连接状态')}"><h2>${say('Device status','设备状态')}</h2><div class="device-status-grid">${cards}</div>${notices.length?`<p class="device-status-notice" role="status">${notices.map(esc).join(' ')}</p>`:''}</section>`;
}
function statusMenu(data:Snapshot|null){
  const attention=!!view.error||!!view.warning||!!data&&(data.locked||!data.showEntry||!data.stockAvailable||Object.values(data.devices).some(state=>state==='disconnected'||state==='connecting'));
  return `<div class="status-menu"><button type="button" data-status-toggle aria-expanded="${statusOpen}" aria-controls="device-status-popover"><i class="status-dot ${attention?'status-dot-attention':''}" aria-hidden="true"></i>${say('Device status','设备状态')}</button>${statusOpen?`<aside id="device-status-popover" class="status-popover">${deviceStatus(data)}${options.debug?`<label class="debug-toggle"><input type="checkbox" data-debug-toggle ${showDebug?'checked':''}>${say('Show debug logs','开启调试日志')}</label>`:''}</aside>`:''}</div>`;
}
function orderList(data:Snapshot|null){
  if(!data)return `<p class="queue-empty">${say('Waiting for the station…','正在等待设备连接…')}</p>`;
  const groups=queueGroups(data.orders,data.currentOrder);
  return `<section class="order-queue"><div class="queue-heading"><h2>${say('Orders at this station','设备订单')} <b class="count-badge">${data.ordersAvailable?data.ordersTotal:'—'}</b></h2></div>
    <p class="queue-note">${say('All statuses, in the order returned by this station. Match your order number; this is not your queue position.','显示所有状态，顺序与设备返回一致。请核对订单编号，此列表不代表你的排队位置。')}</p>
    ${!data.ordersAvailable?`<p class="queue-empty" role="status">${say('Queue unavailable. Reconnecting automatically.','暂时无法读取队列，正在自动重连。')}</p>`:groups.all.length?`<ol class="waiting-list">${groups.all.map(order=>`<li>${orderPreview(order)}<div class="waiting-identity"><strong>${say('Order ending','订单尾号')} <b>${orderCode(order)}</b></strong><small>${modelName(order)}</small><small class="full-order-secondary">${esc(order.tradeNo)}</small></div><span class="order-state">${orderStateLabel(order)}</span></li>`).join('')}</ol>`:`<p class="queue-empty">${data.ordersRejected?say('Orders could not be identified. Check diagnostics.','订单编号无法识别，请查看调试数据。'):say('No orders returned by this station.','设备接口未返回订单。')}</p>`}
    ${data.ordersRejected?`<p class="status-note attention">${say('Some rows have missing or duplicate order IDs. Valid orders remain visible.','部分记录缺少订单编号或编号重复，正常订单仍会显示。')}</p>`:''}</section>`;
}
function dashboard(data:Snapshot|null){
  const groups=queueGroups(data?.orders||[],data?.currentOrder||null);
  const unread=arrivals.ids().filter(id=>groups.confirmation.some(order=>order.tradeNo===id));
  const native=data?.currentOrder;
  const activeStatus=data?.printStatus&&['grabbing','grab_success','printing','print_success','delivering'].includes(data.printStatus)?data.printStatus:null;
  const failed=!!data?.printStatus?.endsWith('_failed');
  const delivered=native&&queueState(native)==='delivered'?native:null;
  const paused=!!data&&(data.locked||!data.showEntry);
  const unknown=!data||!data.printAvailable;
  const pending=!unknown&&!paused&&!activeStatus&&!failed&&!delivered?groups.confirmation[0]:null;
  const current=activeStatus||failed?native:delivered||pending||(!unknown&&!paused?groups.waiting[0]:null);
  const phase=delivered?3:activeStatus?(['grabbing','grab_success'].includes(activeStatus)?0:['printing','print_success'].includes(activeStatus)?1:2):-1;
  const title=paused?say('This station is paused','设备暂时无法打印'):unknown?say('Checking station status','正在核实设备状态'):failed?printLabel(data!.printStatus!):delivered?say('Your case is ready. Please collect.','制作完成，请取走手机壳'):activeStatus?printLabel(activeStatus):pending?say('Your design is ready to print.','你的作品，准备好制作了。'):groups.waiting.length?say('Waiting for the device','等待设备开始打印'):say('Your next creation starts here.','下一件专属设计，等你来。');
  const caption=paused?say('Check your saved order on your phone.','请在手机端查看已有订单的处理进度。'):unknown?say('Waiting for the latest feedback. Do not resubmit your order.','正在等待最新反馈，请勿重复提交订单。'):failed?say('Please contact staff. Your order has been kept.','请联系工作人员，原任务已保留。'):delivered?say('Check your order and collect from the outlet below.','请核对订单，到设备下方取物口领取。'):pending?say('Confirm this order and start printing on your phone.','请在手机上核对订单，确认到场并点击「立即打印」。'):activeStatus?say('Your case is being made. Please wait nearby.','机器正在制作这笔订单，请在设备旁耐心等候。'):say('Scan to create while other customers print.','照片、模板、AI，三种方式开始创作。');
  return `<section class="queue-dashboard" aria-label="${say('Printing and queue','打印进度与队列')}">
    ${unread.length?`<aside class="arrival-notice" role="status" aria-live="polite">${say('New order received','新订单已到达设备')} · ${unread.length} <span>${say('Confirm on your phone','请在手机上确认')}</span></aside>`:''}
    <section class="current-job ${unknown||paused||failed?'job-error':pending?'confirmation-job':delivered?'delivered-job':activeStatus?'':'idle-job'}" aria-label="${say('Current print','当前打印')}">
      <div class="job-top"><span class="eyebrow">${pending?say('DESIGN RECEIVED','作品已收到'):delivered?say('READY TO PICK UP','本单已出货'):say('CURRENT PRINT','当前打印')}</span><span class="live-badge"><i></i>${paused?say('Paused','暂停服务'):unknown?say('Awaiting feedback','等待反馈'):failed?say('Needs assistance','需要处理'):delivered?say('Please collect','请领取'):activeStatus?say('In progress','进行中'):pending?say('Awaiting confirmation','待手机确认'):say('Standing by','等待新订单')}</span></div>
      <div class="job-identity">${current?orderPreview(current,true):`<div class="state-illustration" aria-hidden="true">${unknown||paused||failed?scanIcon:'✧'}</div>`}<div class="job-copy"><h2>${title}</h2><p class="action-caption">${caption}</p>${current?`<p class="order-tail">${say('Order ending','订单尾号')}<b>${orderCode(current)}</b></p><p class="model-label">${modelName(current)}</p><p class="full-order-secondary">${say('Order','订单编号')} ${esc(current.tradeNo)}</p>`:''}</div></div>
      ${activeStatus&&data?.progress!==null?`<div class="progress-heading"><span>${say('Print progress','打印进度')}</span><strong class="progress-number">${data?.progress}<small>%</small></strong></div><progress max="100" value="${data?.progress}" aria-label="${say('Overall progress','整体进度')}"></progress>`:''}
      ${phase>=0?`<ol class="print-phases">${[say('Prepare case','机器备料'),say('Print','打印图案'),say('Dispense','出货')].map((label,index)=>`<li class="${index<phase?'phase-done':index===phase?'phase-active':''}"><b>${index<phase?'✓':String(index+1).padStart(2,'0')}</b>${label}</li>`).join('')}</ol>`:''}
      <p class="progress-note">${delivered?say('↓ Collect your case from the outlet below.','↓ 请从下方取物口取走手机壳'):pending?say('Printing is confirmed on your phone. No payment is taken on this screen.','在手机端确认开印，本屏仅展示订单与进度。'):activeStatus?say('Please check your order number. Follow updates on your phone.','请核对订单尾号，进度也可在手机上查看。'):say('Your order will appear here after it is sent to this station.','手机提交后，本屏将显示你的作品。')}<span aria-hidden="true">•••</span></p>
    </section>
    <div class="quick-access"><p class="quiet-note">✓ ${say('Create and confirm on your phone','手机创作、确认 · 设备自动制作')}</p><button data-sheet="orders" aria-haspopup="dialog" class="queue-brief"><span><strong>${say('Station orders','本机订单')} <b>${data?.ordersAvailable?data.ordersTotal:'—'}</b></strong><small>${say('View all orders and statuses','查看订单列表与全部状态')}</small></span><span aria-hidden="true">→</span></button></div>
    <p class="order-counts">${data?.ordersAvailable?`${say('Returned','接口返回')} ${data.ordersTotal} · ${say('Readable','可显示')} ${data.orders.length} · ${say('Invalid / duplicate','异常 / 重复')} ${data.ordersRejected}`:say('Order count unavailable','订单数暂不可读')}</p>
  </section>`;
}
function sheetContent(data:Snapshot|null){
  if(sheet==='orders')return orderList(data);
  if(sheet==='help')return `<p class="guide-lead">${say('Check your order on your phone. If printing needs help, contact station staff.','请先在手机端查看订单；打印或出货异常时，请联系现场工作人员。')}</p>${data?.contact?`<p class="guide-device">${esc(data.contact)}</p>`:''}<p>${say('Do not pay again or resubmit while a print result is being checked.','状态核实中请勿重复付款或重新提交打印。')}</p>`;
  const existing=sheet==='existing';
  return `<p class="guide-lead">${say('Scan the main screen QR code to connect to this station.','扫描主屏二维码，连接这台设备。')}</p><ol class="guide-steps">${(existing?[
    [say('Choose an existing order','选择已有作品或订单'),say('Open My orders on your phone and check the design and phone model.','在手机上打开「我的订单」，核对设计与机型。')],
    [say('Confirm the target station','核对订单绑定的设备'),say('Only eligible, unprinted pickup orders can be sent to this station.','仅支持符合条件、尚未打印且绑定本机的现场自取订单。')],
    [say('Confirm printing on your phone','在手机上确认开印'),say('For a paid order, do not pay again. Confirm at the station, then follow progress here.','已付订单无需重复付款。在手机上确认到场并点击「立即打印」，本屏显示进度。')]
  ]:[
    [say('Choose your model and design','选择机型，开始设计'),say('Upload a photo, choose a design, or use AI on your phone.','在手机上上传照片、选择模板或使用 AI 创作。')],
    [say('Review your design and station','确认设计与设备'),say('Check your model, design and target station, then submit your order.','核对机型、设计和目标设备，完成订单并提交。')],
    [say('Start printing on your phone','在手机上确认开印'),say('Confirm you are at this station and tap Print now on your phone. Collect after dispensing.','确认已到这台设备前，在手机上点击「立即打印」，出货后自行领取。')]
  ]).map(([title,copy],index)=>`<li><b>0${index+1}</b><div><h3>${title}</h3><p>${copy}</p></div></li>`).join('')}</ol><p class="guide-device">${say('This station','当前设备')} <strong>${esc(data?.name||data?.number||'—')}</strong></p>`;
}
function render(){
  if(disposed)return;
  root.lang=language;
  root.dir="ltr";
  const data=view.data;
  if(data)arrivals.update(`${data.shopId}/${data.deviceId}`,data.orders,data.ordersAvailable);
  let reason=view.error||(view.loading&&!data?'loading':data?unavailable(data):'host-missing'),url='';
  let qrImage='';
  if(!reason&&data){try{url=designUrl(data,language);qrImage=qr(url);}catch{reason='invalid-url';}}
  const active=(root.getRootNode() instanceof ShadowRoot?(root.getRootNode() as ShadowRoot).activeElement:document.activeElement) as HTMLElement|null;
  const focusKey=active?.getAttribute('data-sheet-control');
  const scroll=root.querySelector('.sheet-body')?.scrollTop||0;
  root.innerHTML=`<div class="kiosk-content" ${sheet?'inert':''}><header class="kiosk-header"><img class="brand" src="${esc(options.brandUrl??brandV6)}" width="360" height="82" alt="POPOMO"><div class="station-identity"><strong>${esc(data?.name||say('POPOMO station','POPOMO 打印设备'))}</strong><span>${say('Device','设备编号')} ${esc(data?.number||data?.deviceId||'—')}</span></div>${statusMenu(data)}</header>
    ${preview?`<aside class="preview-bar">${say('Browser preview · Sample data','浏览器预览 · 示例数据')}</aside>`:''}
    <main><div class="terminal-layout"><section class="scan glass" aria-label="${say('Scan entry','扫码入口')}">
    ${reason?`<div class="placeholder" role="status">${scanIcon}<p>${message(reason)}</p><small>${say('Updates automatically','状态将自动更新')}</small></div>`:`<div class="qr">${qrImage}</div>`}
    <div class="scan-copy"><p class="eyebrow">ONE SCAN. YOUR OWN CASE.</p><h1>${reason?message(reason):say('Scan. Make it yours.','手机扫码，提交作品')}</h1><div class="scan-entries"><button class="scan-entry create-entry" data-sheet="new" aria-haspopup="dialog"><span><small>${say('A new idea?','还没设计？')}</small><strong>${say('Create your case','扫码开始创作')}</strong></span><span aria-hidden="true">→</span></button><button class="scan-entry existing-entry" data-sheet="existing" aria-haspopup="dialog"><span><small>${say('Already have a design or order?','已有作品／订单？')}</small><strong>${say('Send an existing order','扫码提交已有订单')}</strong></span><span aria-hidden="true">→</span></button></div><p class="scan-hint">${scanIcon}${say('One QR code. Choose on your phone.','共用左侧二维码，在手机上选择。')}</p></div>
    </section>${dashboard(data)}</div><div class="station-status"><span>${say('Updates automatically','状态自动更新')}${view.updatedAt?' · '+esc(new Date(view.updatedAt).toLocaleTimeString(language)):''}</span></div>${debugPanel(reason,url)}</main>
    <footer><span>${say('Create on your phone · Print here · Collect','手机创作 · 设备打印 · 现场领取')}</span><button data-sheet="help" aria-haspopup="dialog">ⓘ ${say('Need help','需要帮助')}</button></footer></div>
    ${sheet?`<dialog class="sheet" aria-labelledby="sheet-title"><header class="sheet-header"><h2 id="sheet-title">${({new:say('Create your own case','扫码开始创作'),existing:say('Print an existing design','已有设计，来打印'),orders:say('Orders at this station','本机订单列表'),help:say('Need help','需要帮助')})[sheet]}</h2><button data-sheet-close data-sheet-control="close" aria-label="${say('Close dialog','关闭弹窗')}">×</button></header><div class="sheet-body">${sheetContent(data)}</div><button class="sheet-back" data-sheet-close data-sheet-control="back">${say('Back to the display','返回打印看板')} →</button></dialog>`:''}`;
  const dialog=root.querySelector<HTMLDialogElement>('dialog.sheet');
  if(dialog){dialog.showModal();root.querySelector('.sheet-body')!.scrollTop=scroll;if(focusKey)root.querySelector<HTMLElement>(`[data-sheet-control="${focusKey}"]`)?.focus({preventScroll:true});}

}
function debugPanel(reason:string|null,url:string){
  if(!options.debug||!showDebug)return '';
  const diag=view.diagnostics;
  return `<section class="debug-panel" aria-label="设备调试数据"><h2>设备调试数据 / Device debug</h2><p>二维码：${esc(reason||'显示中')} ${url?`<code>${esc(url)}</code>`:''}</p><p>订单接口：${diag?.ordersTotal??'尚未返回'} 条 · 凭证已打码 · 长数组只预览前 200 条，字符串最多 2000 字符</p><h3>接口最新返回</h3>${Object.entries(diag?.commands||{}).map(([name,entry])=>`<article><h4>${esc(name)} · ${entry.status} · ${entry.elapsedMs} ms</h4><pre>${esc(JSON.stringify(entry.value,null,2)??'undefined')}</pre></article>`).join('')||'<p>等待宿主接口…</p>'}<h3>最近事件（最多 20 条）</h3>${(diag?.events||[]).map(entry=>`<article><h4>${esc(entry.name)} · ${esc(new Date(entry.at).toLocaleTimeString())}</h4><pre>${esc(JSON.stringify(entry.value,null,2)??'undefined')}</pre></article>`).join('')||'<p>尚未收到事件</p>'}</section>`;
}
function closeSheet(){const previous=sheet;sheet=null;render();root.querySelector<HTMLButtonElement>(`[data-sheet="${previous}"]`)?.focus({preventScroll:true});}
function menuClick(event:Event){
  const target=event.target as Element;
  const entry=target.closest<HTMLElement>('[data-sheet]');
  if(entry){sheet=entry.dataset.sheet as Sheet;statusOpen=false;render();return;}
  if(target.closest('[data-sheet-close]')){closeSheet();return;}
  if(target.matches('dialog.sheet')){const rect=target.getBoundingClientRect(),e=event as MouseEvent;if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)closeSheet();return;}
  if(target.closest('[data-status-toggle]')){statusOpen=!statusOpen;render();root.querySelector<HTMLButtonElement>('[data-status-toggle]')?.focus({preventScroll:true});}
}
function debugChange(event:Event){const input=event.target as HTMLInputElement;if(input.matches('[data-debug-toggle]')){showDebug=input.checked;controller?.setDebug(showDebug);render();root.querySelector<HTMLInputElement>('[data-debug-toggle]')?.focus({preventScroll:true});}}
function menuKey(event:KeyboardEvent){
  if(sheet&&event.key==='Tab'){
    const buttons=Array.from(root.querySelectorAll<HTMLButtonElement>('dialog.sheet button:not(:disabled)'));
    const first=buttons[0],last=buttons.at(-1),target=event.target;
    if(event.shiftKey&&target===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&target===last){event.preventDefault();first?.focus();}
  }
  if(event.key==='Escape'){
    if(sheet){event.preventDefault();closeSheet();}
    else if(statusOpen){statusOpen=false;render();root.querySelector<HTMLButtonElement>('[data-status-toggle]')?.focus({preventScroll:true});}
  }
}
root.addEventListener('click',menuClick);root.addEventListener('change',debugChange);root.addEventListener('keydown',menuKey);
function start(){controller?.dispose();if(!bridge){view={data:null,loading:false,error:'host-missing',updatedAt:null};render();return;}view={data:null,loading:true,error:null,updatedAt:null};render();controller=new TerminalController(bridge,next=>{view=next;render();options.onView?.(next);},15000,10000,!!options.debug&&showDebug);void controller.start();}
function visibilityChanged(){if(!document.hidden)void controller?.refresh();}
function suspend(){controller?.dispose();}
function pageShown(event:PageTransitionEvent){if(event.persisted&&!disposed){start();}}
window.addEventListener('resize',render);
document.addEventListener('visibilitychange',visibilityChanged);
window.addEventListener('pagehide',suspend);
window.addEventListener('pageshow',pageShown);
start();
return {
  refresh(){if(!disposed)void controller?.retry();},
  dispose(){
    if(disposed)return;
    disposed=true;suspend();
    root.removeEventListener('error',previewFailed,true);
    root.removeEventListener('click',menuClick);root.removeEventListener('change',debugChange);root.removeEventListener('keydown',menuKey);
    window.removeEventListener('resize',render);
    document.removeEventListener('visibilitychange',visibilityChanged);
    window.removeEventListener('pagehide',suspend);
    window.removeEventListener('pageshow',pageShown);
    root.replaceChildren();
  }
};
}
