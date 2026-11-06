// LEGACY: not mounted by the display-only terminal. Kept for historical adapter tests.
import {invoke,isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {SupplierOrderApi,DEFAULT_EXTERNAL_PAYMENT_TYPE,type ExternalPaymentVerifier} from './order-api';

// Cloud handoff supplies the device-scoped, one-shot server verifier.
export function nativeOrderApi(verifyExternalPayment?:ExternalPaymentVerifier){
  if(!isTauri())throw Error('The supplier terminal host is required');
  return new SupplierOrderApi({invoke:(command,args)=>invoke(command,args),listen:(event,callback)=>listen(event,message=>callback(message.payload))},15000,DEFAULT_EXTERNAL_PAYMENT_TYPE,verifyExternalPayment);
}
