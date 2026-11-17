import {build} from 'esbuild';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const result=await build({absWorkingDir:root,entryPoints:['src/log-replay/main.ts'],bundle:true,write:false,format:'iife',target:'es2022',loader:{'.webp':'dataurl','.svg':'dataurl'},define:{'import.meta.env.BASE_URL':'"./"','import.meta.env.VITE_DEFAULT_LANGUAGE':'"zh-CN"'}});
const css=readFileSync(resolve(root,'src/style.css'),'utf8');
const js=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"><title>POPOMO 真机日志调试</title><style>${css}\n#replay-controls{margin:16px auto;padding:18px;max-width:1080px;background:#fff8df;border:2px solid #a87900;border-radius:12px;text-align:left}#replay-controls h1{font-size:24px}#replay-controls p{font-size:13px;line-height:1.6}#replay-controls .replay-buttons{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}#replay-controls select{max-width:100%;min-width:0;padding:8px;flex:1}#replay-controls button{font-size:13px;padding:8px}#replay-controls details{margin-top:12px}</style></head><body><section id="replay-controls"></section><div id="app"></div><script>${js}</script></body></html>`;
mkdirSync(resolve(root,'release'),{recursive:true});const output=resolve(root,'release/popomo-log-replay-2026-11-07.html');writeFileSync(output,html);console.log(output);
