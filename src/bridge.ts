import {invoke,isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {Bridge} from './domain';
export function nativeBridge():Bridge|null{
  if(!isTauri())return null;
  return {invoke:command=>invoke(command),listen:(event,callback)=>listen(event,message=>callback(message.payload))};
}
