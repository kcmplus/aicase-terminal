// Only the supplier's effect_image is a display preview. Never fall back to target_image.
export function previewSource(value:unknown,options:{convertLocal?:(path:string)=>string;demoBase?:string}={}):string|null{
  if(typeof value!=='string'||!value.trim()||value.length>8192||/[\u0000-\u001f\u007f]/.test(value))return null;
  const source=value.trim();
  if(/^https?:\/\//i.test(source)||source.startsWith('asset://')){
    try{const url=new URL(source);return !url.username&&!url.password?url.href:null;}catch{return null;}
  }
  if(options.demoBase&&/^\/preview-images\/[a-z-]+\.webp$/.test(source))return new URL(source,options.demoBase).href;
  // Absolute host paths are resolved through Tauri's scoped asset protocol, never a file:// URL.
  if(options.convertLocal&&(/^[A-Za-z]:[\\/]/.test(source)||source.startsWith('/')&&!source.startsWith('//'))){
    if(!/\.(png|jpe?g|webp|gif|avif)$/i.test(source)||source.split(/[\\/]/).includes('..'))return null;
    try{return options.convertLocal(source);}catch{return null;}
  }
  return null;
}
