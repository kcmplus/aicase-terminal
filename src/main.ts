import QRCode from 'qrcode';
import {convertFileSrc,isTauri} from '@tauri-apps/api/core';
import {previewSource} from './order-preview';
import {nativeBridge} from './bridge';
import {TerminalController,type View} from './controller';
import {designUrl,unavailable,type Language,type Bridge,type Snapshot} from './domain';
import {queueState,queueGroups,OrderArrivals,type QueueOrder} from './queue';
import './style.css';

const root=document.querySelector<HTMLDivElement>('#app')!;
let language:Language=import.meta.env.VITE_DEFAULT_LANGUAGE==='zh-CN'?'zh-CN':'en-US';
const initialLanguage=new URLSearchParams(location.search).get('lang');
if(initialLanguage==='zh-CN'||initialLanguage==='en-US')language=initialLanguage;
let view:View={data:null,loading:true,error:null,updatedAt:null},controller:TerminalController|undefined;
let bridge:Bridge|null=nativeBridge(),preview=false;
let rotationTimer:ReturnType<typeof setInterval>|undefined;
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
function modelName(order:QueueOrder){return esc(order.model||`${say('Product','商品')} #${order.goodsId}`);}
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
let queuePage=0;
const arrivals=new OrderArrivals();
function dashboard(data:Snapshot|null){
  if(!data)return `<section class="queue-dashboard"><div class="current-job idle-job"><p class="eyebrow">${say('PRINTING AT THIS STATION','设备打印动态')}</p><h2>${say('Connecting to the station','正在连接设备')}</h2><p>${say('Orders will appear once connected.','连接成功后显示打印进度和排队订单。')}</p></div></section>`;
  const groups=queueGroups(data.orders,data.currentOrder);
  const unread=arrivals.ids().filter(id=>groups.confirmation.some(order=>order.tradeNo===id));
  const current=data.currentOrder&&queueState(data.currentOrder)==='printing'?data.currentOrder:null;
  const activeStatus=current?.printStatus||(data.printStatus&&['grabbing','grab_success','printing','print_success','delivering'].includes(data.printStatus)?data.printStatus:null);
  const failed=data.printStatus?.endsWith('_failed');
  const phase=activeStatus?(['grabbing','grab_success'].includes(activeStatus)?0:['printing','print_success'].includes(activeStatus)?1:2):-1;
  const compact=window.matchMedia('(max-width:600px)').matches,confirmationSize=compact?1:2;
  const pageSize=compact?2:3,pages=Math.max(1,Math.ceil(groups.waiting.length/pageSize)),waitingPage=queuePage%pages;
  const confirmationPages=Math.max(1,Math.ceil(groups.confirmation.length/confirmationSize)),confirmationPage=queuePage%confirmationPages;
  const visible=groups.waiting.slice(waitingPage*pageSize,(waitingPage+1)*pageSize);
  return `<section class="queue-dashboard" aria-label="${say('Printing and queue','打印进度与队列')}">
    ${unread.length?`<aside class="arrival-notice" role="status" aria-live="polite"><div><strong>${say('New order received','新订单已到达设备')} · ${unread.length}</strong><p>${say('Please confirm your arrival on your phone.','请在手机上核对订单并确认到场。')}</p></div></aside>`:''}

    <section class="current-job ${failed?'job-error':activeStatus?'':'idle-job'}" aria-label="${say('Current print','当前打印')}">
      <div class="job-top"><span class="eyebrow">${say('CURRENT PRINT','当前打印')}</span><span class="live-badge"><i></i>${failed?say('Needs assistance','需要处理'):activeStatus?say('In progress','进行中'):say('Standing by','待命中')}</span></div>
      <div class="job-identity">${current?orderPreview(current,true):''}<div class="job-copy"><h2>${activeStatus?printLabel(activeStatus):failed?printLabel(data.printStatus!):groups.waiting.length?say('Waiting for the device','等待设备开始打印'):say('Ready for your design','等待你的专属设计')}</h2><p>${current?`${modelName(current)} · ${say('Order ending','订单尾号')} <b>${orderCode(current)}</b>`:activeStatus?say('Reading the current order…','正在读取当前订单…'):say('You can scan and design while others print.','其他客户打印时，你也可以扫码设计。')}</p></div>${activeStatus&&data.progress!==null?`<strong class="progress-number">${data.progress}<small>%</small></strong>`:''}</div>
      ${activeStatus?`${data.progress!==null?`<progress max="100" value="${data.progress}" aria-label="${say('Overall progress','整体进度')}"></progress>`:''}<ol class="print-phases">${[say('Prepare case','准备手机壳'),say('Print','打印图案'),say('Dispense','设备出货')].map((label,index)=>`<li class="${index<phase?'phase-done':index===phase?'phase-active':''}"><b>${index<phase?'✓':index+1}</b>${label}</li>`).join('')}</ol>`:''}
    </section>
    ${groups.delivered.length?`<section class="pickup-notice"><span class="pickup-icon" aria-hidden="true">✓</span><div><strong>${say('Dispensed · Please collect','已出货，请取走手机壳')}</strong><p>${say('Order ending','订单尾号')} ${groups.delivered.slice(0,4).map(orderCode).join(' · ')}${groups.delivered.length>4?` +${groups.delivered.length-4}`:''}</p></div></section>`:''}
    ${groups.confirmation.length?`<section class="confirmation-queue" aria-label="${say('Awaiting confirmation','待确认订单')}"><div class="queue-heading"><h2>${say('Awaiting confirmation','待确认')} <b class="count-badge">${groups.confirmation.length}</b></h2></div><p>${say('Confirm you are at this station on your phone.','请在手机上确认已到这台设备前。')}</p><ul>${groups.confirmation.slice(confirmationPage*confirmationSize,(confirmationPage+1)*confirmationSize).map(order=>`<li>${orderPreview(order)}<div class="confirmation-identity"><strong>${modelName(order)} ${unread.includes(order.tradeNo)?`<em>${say('New','新')}</em>`:''}</strong><small>${say('Order ending','订单尾号')} ${orderCode(order)}</small></div><span class="order-state">${say('Awaiting confirmation','待确认')}</span></li>`).join('')}</ul>${confirmationPages>1?`<p class="auto-page">${say('Auto display','自动轮播')} · ${confirmationPage+1} / ${confirmationPages}</p>`:''}</section>`:''}
    <section class="order-queue"><div class="queue-heading"><h2>${say('Waiting to print','等待打印')} <b class="count-badge">${data.ordersAvailable?groups.waiting.length:'—'}</b></h2></div>
      <p class="queue-note">${say('Multiple customers can submit. The device controls printing order.','支持多人扫码提交，按设备队列依次打印。')}</p>
      ${!data.ordersAvailable?`<p class="queue-empty" role="status">${say('Queue unavailable. Reconnecting automatically.','暂时无法读取队列，正在自动重连。')}</p>`:visible.length?`<ol class="waiting-list">${visible.map((order,index)=>`<li><span class="position">${String(waitingPage*pageSize+index+1).padStart(2,'0')}</span>${orderPreview(order)}<div class="waiting-identity"><strong>${modelName(order)}</strong><small>${say('Order ending','订单尾号')} <b>${orderCode(order)}</b></small></div><span class="order-state">${say('Queued','排队中')}</span></li>`).join('')}</ol>`:`<p class="queue-empty">${say('No orders waiting. Scan to start your design.','暂无等待订单，扫码开始你的设计。')}</p>`}
      ${pages>1?`<p class="auto-page">${say('Auto display','自动轮播')} · ${waitingPage+1} / ${pages}</p>`:''}

      ${groups.active.filter(order=>order.tradeNo!==current?.tradeNo).length?`<p class="status-note">${say('Other processing orders','其他处理中订单')}：${groups.active.filter(order=>order.tradeNo!==current?.tradeNo).map(order=>`${orderCode(order)} · ${printLabel(order.printStatus)}`).join(' / ')}</p>`:''}
      ${groups.attention.length?`<p class="status-note attention">${say('Needs assistance','待处理订单')}：${groups.attention.map(order=>`${orderCode(order)} · ${queueState(order)==='failed'?say('Exception','异常'):say('Status pending','状态待确认')}`).join(' / ')}</p>`:''}
    </section>
  </section>`;
}
function render(){
  document.documentElement.lang=language;
  const data=view.data;
  if(data)arrivals.update(`${data.shopId}/${data.deviceId}`,data.orders,data.ordersAvailable);
  let reason=view.error||(view.loading&&!data?'loading':data?unavailable(data):'host-missing'),url='';
  let qrImage='';
  if(!reason&&data){try{url=designUrl(data,language,import.meta.env.VITE_STOREFRONT_URL||'');qrImage=qr(url);}catch{reason='invalid-url';}}
  root.innerHTML=`<header><img class="brand" src="${import.meta.env.BASE_URL}popomo-wordmark.webp" width="1035" height="200" alt="POPOMO"><span>${say('YOUR PHOTO. YOUR CASE.','你的照片，你的手机壳。')}</span></header>
    ${preview?`<aside class="preview-bar"><span>${say('Browser preview · Sample data','浏览器预览 · 示例数据')}</span></aside>`:''}
    <main><div class="terminal-layout"><section class="scan"><p class="eyebrow">${say('MAKE IT YOURS','做一个，属于你的。')}</p><h1>${reason?message(reason):say('Scan to create your case','手机扫码，选择照片')}</h1><p class="lead">${reason?say('Thank you for your patience.','感谢你的耐心等候。'):say('Choose a photo from your album. Make it your own.','用相册里的喜欢，设计你的专属手机壳。')}</p>
    ${reason?`<div class="placeholder" role="status">${scanIcon}<p>${message(reason)}</p>${reason==='host-missing'?`<small>${say('Please open this page inside the device app.','请在设备终端应用内打开此页面。')}</small>`:`<small>${say('Updates automatically','状态将自动更新')}</small>`}</div>`:`<div class="qr">${qrImage}</div><p class="scan-hint">${scanIcon}${say('Open your phone camera and scan','打开手机相机，扫描二维码')}</p>`}
    <ol class="steps"><li><b>1</b>${say('Scan on your phone','手机扫码')}</li><li><b>2</b>${say('Choose your photo','选择照片')}</li><li><b>3</b>${say('Design your case','设计手机壳')}</li></ol>
    <p class="model-note">${say('Choose your phone model after scanning.','扫码后选择你的手机型号。')}</p>
    </section>${dashboard(data)}</div>
    <div class="station-status"><span>${esc(data?.number||say('POPOMO station','POPOMO 打印设备'))}</span><span>${say('Updates automatically','状态自动更新')}${view.updatedAt?' · '+esc(new Date(view.updatedAt).toLocaleTimeString(language)):''}</span></div></main>
    <footer>${data?.contact?`${say('Need help?','需要帮助？')} ${esc(data.contact)}`:say('YOUR PHOTO. YOUR CASE. YOUR EVERYDAY.','你的照片，你的手机壳，你的每一天。')}</footer>`;
}
function start(){clearInterval(rotationTimer);rotationTimer=setInterval(()=>{if(!document.hidden){queuePage++;render();}},8000);controller?.dispose();if(!bridge){view={data:null,loading:false,error:'host-missing',updatedAt:null};render();return;}view={data:null,loading:true,error:null,updatedAt:null};render();controller=new TerminalController(bridge,next=>{view=next;render();});void controller.start();}
window.addEventListener('resize',render);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void controller?.refresh();});
window.addEventListener('pagehide',()=>{clearInterval(rotationTimer);controller?.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted)start();});
if(import.meta.hot)import.meta.hot.dispose(()=>{root.removeEventListener('error',previewFailed,true);window.removeEventListener('resize',render);clearInterval(rotationTimer);controller?.dispose();});
// Production builds cannot activate the mock bridge through URL parameters.
if(import.meta.env.DEV&&!bridge&&new URLSearchParams(location.search).get('preview')==='1'){
  const {previewBridge}=await import('./preview');const sample=previewBridge();bridge=sample;preview=true;
  const scenario=new URLSearchParams(location.search).get('scenario')||'printing';
  if(['ready','queue','printing','offline','empty','locked','delivered','error'].includes(scenario))sample.setScenario(scenario as import('./preview').Scenario);
}
start();
