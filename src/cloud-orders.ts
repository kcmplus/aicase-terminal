// LEGACY: not imported by either terminal entry. Customer confirmation now belongs to H5.
import type {Snapshot} from './domain';
import type {OrderRecord,ExternalPaymentVerifier,SupplierOrderApi} from './order-api';

export type CloudConfig={url:string;token:string};
type CloudOrder={reference:string;trade_no:string;business_number:string;goods_id:number;release_state:string;claim_id:string|null};
type ApiFactory=(verify:ExternalPaymentVerifier)=>Pick<SupplierOrderApi,'getOrder'|'selectExternalPayment'>;
export function cloudConfig(value:unknown):CloudConfig|null{
  if(!value||typeof value!=='object')return null;
  const c=value as Record<string,unknown>;
  try{
    const url=new URL(String(c.url));
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!/^[-A-Za-z0-9_]{43}$/.test(String(c.token)))return null;
    return {url:url.origin,token:String(c.token)};
  }catch{return null;}
}
function matches(remote:CloudOrder,native:OrderRecord){return native.trade_no===remote.trade_no&&native.business_number===remote.business_number&&native.goods_id===remote.goods_id;}
function records(value:unknown):{release_enabled:boolean;orders:CloudOrder[]}{
  if(!value||typeof value!=='object')throw Error('Invalid cloud response');
  const data=value as {release_enabled:unknown;orders:unknown};
  if(typeof data.release_enabled!=='boolean'||!Array.isArray(data.orders)||data.orders.length>500)throw Error('Invalid cloud orders');
  const seen=new Set<string>();
  for(const row of data.orders){
    if(!row||! /^[a-f0-9-]{36}$/i.test(row.reference)||! /^[A-Za-z0-9_-]{1,120}$/.test(row.trade_no)||seen.has(row.trade_no)
      ||! /^\d{19,32}$/.test(row.business_number)||!Number.isSafeInteger(row.goods_id)||row.goods_id<=0
      ||!['idle','claimed','submitted','unknown','observed'].includes(row.release_state)
      ||(row.claim_id!==null&&! /^[a-f0-9-]{36}$/i.test(row.claim_id)))throw Error('Invalid cloud order');
    seen.add(row.trade_no);
  }
  return data as {release_enabled:boolean;orders:CloudOrder[]};
}

// Serial, passive sidecar. It releases existing vendor orders; never creates a
// local order, sorts the hardware queue, or replays an uncertain payment call.
export class CloudOrders{
  private busy=false;
  private stopped=false;
  constructor(private config:CloudConfig,private snapshot:()=>Snapshot|null,private factory:ApiFactory,
              private fetcher:typeof fetch=fetch,private randomUUID=()=>crypto.randomUUID()){}
  dispose(){this.stopped=true;}
  private identity(device:Snapshot){
    const now=this.snapshot();
    return !this.stopped&&now?.deviceId===device.deviceId&&now.shopId===device.shopId;
  }
  private async request(path:string,device:Snapshot,body?:unknown):Promise<any>{
    if(!this.identity(device))throw Error('Device identity changed');
    const response=await this.fetcher(this.config.url+'/api/v1/terminal/orders/'+path,{
      method:body===undefined?'GET':'POST',credentials:'omit',cache:'no-store',redirect:'error',
      headers:{Authorization:'Bearer '+this.config.token,'Content-Type':'application/json',
        'X-Device-Id':device.deviceId,'X-Shop-Id':device.shopId},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
    if(!response.ok||!this.identity(device))throw Error('Cloud verification unavailable');
    return response.json();
  }
  async tick(){
    if(this.busy||this.stopped)return;
    const device=this.snapshot();
    if(!device||!device.ordersAvailable)return;
    this.busy=true;
    try{
      const data=records(await this.request('',device));
      for(const row of data.orders){
        if(!this.identity(device))break;
        let claimId=row.claim_id;
        const api=this.factory(async native=>{
          if(!matches(row,native)||!this.identity(device))return false;
          claimId=this.randomUUID();
          const result=await this.request(row.reference+'/claim/',device,{trade_no:row.trade_no,
            business_number:row.business_number,goods_id:row.goods_id,claim_id:claimId});
          return result.authorized===true&&this.identity(device);
        });
        try{
          const native=await api.getOrder(row.trade_no);
          if(!native||!matches(row,native))continue;
          const report=(outcome:string,observed?:OrderRecord)=>this.request(row.reference+'/observe/',device,{
            trade_no:row.trade_no,business_number:row.business_number,goods_id:row.goods_id,claim_id:claimId,outcome,
            ...(observed?{pay_status:observed.pay_status,print_status:observed.print_status}:{})});
          if(row.release_state==='idle'){
            const now=this.snapshot();
            if(!data.release_enabled||!now||now.locked||!now.showEntry||Object.values(now.devices).some(s=>!['connected','online'].includes(s))
              ||native.print_status!=='idle'||native.pay_status!=='idle'||!['none','polling'].includes(native.status))continue;
            try{
              await api.selectExternalPayment(row.trade_no);
              if(claimId)await report('submitted');
            }catch{
              // If claim/IPC/ack is uncertain, record it and only observe later.
              if(claimId)try{await report('unknown');}catch{/* next poll observes the durable server claim */}
            }
          }else if(claimId){
            await report('observed',native);
          }
        }catch{/* A missing order or network error must never permit printing. */}
      }
    }catch{/* Reconnect on the next scheduled tick; never expose credentials/errors. */}
    finally{this.busy=false;}
  }
}
