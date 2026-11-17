export type DiagnosticEntry={status:'pending'|'success'|'error';elapsedMs:number;value:unknown};
export type Diagnostics={commands:Record<string,DiagnosticEntry>;events:Array<{name:string;at:number;value:unknown}>;ordersTotal:number|null};
const privateKey=/pass(word)?|token|secret|authorization|cookie|device_mac|contact_(person|tel)|target_image|model_body_image|picture/i;
export function debugValue(value:unknown,depth=0):unknown{
  if(depth>8)return '[depth limit]';
  if(value instanceof Error)return {name:value.name,message:debugValue(value.message,depth+1)};
  if(typeof value==='string'){
    const safe=value.replace(/(Bearer\s+)\S+/gi,'$1[redacted]').replace(/((?:password|token|secret|authorization|api_key)\s*[=:]\s*)[^\s&,;]+/gi,'$1[redacted]');
    return safe.length>2000?safe.slice(0,2000)+'… [truncated]':safe;
  }
  if(Array.isArray(value))return [...value.slice(0,200).map(item=>debugValue(item,depth+1)),...(value.length>200?[`[${value.length-200} more rows; ${value.length} total]`]:[])];
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,privateKey.test(key)?'[redacted]':debugValue(item,depth+1)]));
  return value;
}
