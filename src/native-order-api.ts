import {invoke,isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {SupplierOrderApi,DEFAULT_EXTERNAL_PAYMENT_TYPE,type ExternalPaymentVerifier} from './order-api';

// Integration entry point, intentionally not imported by main.ts until payment handoff is agreed.
export function nativeOrderApi(verifyExternalPayment?:ExternalPaymentVerifier){
  if(!isTauri())throw Error('The supplier terminal host is required');
  return new SupplierOrderApi({invoke:(command,args)=>invoke(command,args),listen:(event,callback)=>listen(event,message=>callback(message.payload))},15000,import.meta.env.VITE_EXTERNAL_PAYMENT_TYPE??DEFAULT_EXTERNAL_PAYMENT_TYPE,verifyExternalPayment);
}
