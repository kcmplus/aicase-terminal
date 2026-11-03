import QRCode from 'qrcode';
import {nativeBridge} from './bridge';
import {TerminalController,type View} from './controller';
import {designUrl,unavailable,type Language,type Bridge} from './domain';
import './style.css';

const root=document.querySelector<HTMLDivElement>('#app')!;
let language:Language=import.meta.env.VITE_DEFAULT_LANGUAGE==='zh-CN'?'zh-CN':'en-US';
const initialLanguage=new URLSearchParams(location.search).get('lang');
if(initialLanguage==='zh-CN'||initialLanguage==='en-US')language=initialLanguage;
let view:View={data:null,loading:true,error:null,updatedAt:null},controller:TerminalController|undefined;
let bridge:Bridge|null=nativeBridge(),preview=false,scenario='ready',changeScenario:((value:string)=>void)|undefined;
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
    'connection-failed':['Unable to read this station. Please retry.','暂时无法读取设备，请重试。'],
    'invalid-url':['The mobile website has not been configured.','手机端入口尚未配置，请联系工作人员。'],
    paused:['This station is temporarily unavailable.','这台设备暂未开放，请联系工作人员。'],
    offline:['This station is reconnecting. Please wait.','设备正在恢复连接，请稍候。'],
    empty:['No cases available at this station right now.','当前设备暂无可用手机壳。'],
    'print-failed':['This station needs assistance.','设备需要工作人员处理。'],
    loading:['Getting your QR code ready…','正在准备二维码…']
  };
  return say(...(messages[reason]||messages['connection-failed']));
}
function stateLabel(state:string){return ({online:say('Online','在线'),connected:say('Connected','已连接'),connecting:say('Connecting','连接中'),disconnected:say('Offline','离线')})[state]||say('Unknown','待确认');}
function printLabel(status:string){return ({idle:say('Waiting','等待中'),grabbing:say('Preparing your case','正在准备手机壳'),grab_success:say('Case prepared','手机壳已准备'),printing:say('Printing in progress','正在打印'),print_success:say('Printed · Preparing delivery','打印完成 · 等待出货'),delivering:say('Delivering your case','正在出货'),deliver_success:say('Case delivered · Please collect','已出货 · 请取走手机壳'),grab_failed:say('Preparation needs assistance','备料异常，请联系工作人员'),print_failed:say('Printing needs assistance','打印异常，请联系工作人员'),deliver_failed:say('Delivery needs assistance','出货异常，请联系工作人员')})[status]||say('Updating','正在更新');}
function render(){
  document.documentElement.lang=language;
  const data=view.data,open=root.querySelector<HTMLDetailsElement>('#details')?.open;
  let reason=view.error||(view.loading&&!data?'loading':data?unavailable(data):'host-missing'),url='';
  let qrImage='';
  if(!reason&&data){try{url=designUrl(data,language,import.meta.env.VITE_STOREFRONT_URL||'');qrImage=qr(url);}catch{reason='invalid-url';}}
  root.innerHTML=`<header><img class="brand" src="${import.meta.env.BASE_URL}popomo-wordmark.webp" width="1035" height="200" alt="POPOMO"><span>${say('YOUR PHOTO. YOUR CASE.','你的照片，你的手机壳。')}</span><button data-action="language" aria-label="${say('Switch to Chinese','切换为英文')}">${language==='zh-CN'?'English':'中文'}</button></header>
    ${preview?`<aside class="preview-bar"><span>${say('Browser preview · Sample data','浏览器预览 · 示例数据')}</span><select aria-label="${say('Preview scenario','预览状态')}">${[['ready','扫码首页'],['printing','打印中'],['delivered','已出货'],['offline','离线'],['empty','无库存'],['locked','暂停服务'],['error','读取失败']].map(([key,name])=>`<option value="${key}" ${key===scenario?'selected':''}>${language==='zh-CN'?name:key}</option>`).join('')}</select></aside>`:''}
    <main><section class="scan"><p class="eyebrow">${say('MAKE IT YOURS','做一个，属于你的。')}</p><h1>${reason?message(reason):say('Scan to create your case','手机扫码，选择照片')}</h1><p class="lead">${reason?say('Thank you for your patience.','感谢你的耐心等候。'):say('Choose a photo from your album. Make it your own.','用相册里的喜欢，设计你的专属手机壳。')}</p>
    ${reason?`<div class="placeholder" role="status">${scanIcon}<p>${message(reason)}</p>${reason==='host-missing'?`<small>${say('Please open this page inside the device app.','请在设备终端应用内打开此页面。')}</small>`:`<button data-action="retry">${say('Try again','重新连接')}</button>`}</div>`:`<div class="qr">${qrImage}</div><p class="scan-hint">${scanIcon}${say('Open your phone camera and scan','打开手机相机，扫描上方二维码')}</p>`}
    <ol class="steps"><li><b>1</b>${say('Scan on your phone','手机扫码')}</li><li><b>2</b>${say('Choose your photo','选择照片')}</li><li><b>3</b>${say('Design your case','设计手机壳')}</li></ol>
    <p class="model-note">${say('Choose your phone model after scanning.','扫码后选择你的手机型号。')}</p>
    ${data?.printStatus?`<section class="print-card" aria-label="${say('Current printing status','当前打印状态')}"><span class="print-dot"></span><div><strong>${printLabel(data.printStatus)}</strong>${data.progress!==null?`<progress max="100" value="${data.progress}" aria-label="${say('Print progress','打印进度')}"></progress><small>${data.progress}%</small>`:''}</div></section>`:''}</section>
    <details id="details" ${open?'open':''}><summary><span>${esc(data?.number||say('POPOMO station','POPOMO 打印设备'))}</span><span>${say('Station details','设备信息')} ⌄</span></summary><div class="detail-content"><dl>
    ${data?[[say('Station','设备名称'),data.name],[say('Device / Merchant','设备 / 商家'),`${data.deviceId} / ${data.shopId}`],[say('Printer','打印机'),stateLabel(data.devices.printer)],[say('Gripper','机械臂'),stateLabel(data.devices.gripper)],[say('Network proxy','终端网络代理'),stateLabel(data.devices.netproxy)],[say('Local stock','终端库存'),`${data.stockCount} · ${data.modelCount} ${say('models','款机型')}`],[say('Updated','更新时间'),view.updatedAt?new Date(view.updatedAt).toLocaleTimeString(language):'—']].map(([key,value])=>`<div><dt>${key}</dt><dd>${esc(value)}</dd></div>`).join(''):''}
    </dl><p class="detail-note">${say('Phone availability is checked by the mobile store.','手机端可选机型以商城校验结果为准。')}</p><button data-action="retry">${say('Refresh station','刷新设备信息')}</button></div></details></main>
    <footer>${data?.contact?`${say('Need help?','需要帮助？')} ${esc(data.contact)}`:say('YOUR PHOTO. YOUR CASE. YOUR EVERYDAY.','你的照片，你的手机壳，你的每一天。')}</footer>`;
}
function start(){controller?.dispose();if(!bridge){view={data:null,loading:false,error:'host-missing',updatedAt:null};render();return;}view={data:null,loading:true,error:null,updatedAt:null};render();controller=new TerminalController(bridge,next=>{view=next;render();});void controller.start();}
root.addEventListener('click',event=>{const action=(event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;if(action==='language'){language=language==='zh-CN'?'en-US':'zh-CN';render();}if(action==='retry'){if(controller)void controller.retry();else start();}});
root.addEventListener('change',event=>{if(event.target instanceof HTMLSelectElement){scenario=event.target.value;changeScenario?.(scenario);}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void controller?.refresh();});
window.addEventListener('pagehide',()=>controller?.dispose());
window.addEventListener('pageshow',event=>{if(event.persisted)start();});
if(import.meta.hot)import.meta.hot.dispose(()=>controller?.dispose());
// Production builds cannot activate the mock bridge through URL parameters.
if(import.meta.env.DEV&&!bridge&&new URLSearchParams(location.search).get('preview')==='1'){
  const {previewBridge}=await import('./preview');const sample=previewBridge();bridge=sample;preview=true;changeScenario=value=>sample.setScenario(value as import('./preview').Scenario);
}
start();
