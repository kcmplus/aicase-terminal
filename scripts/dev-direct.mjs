import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {networkInterfaces} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const {values}=parseArgs({options:{'backend-dir':{type:'string',default:path.resolve(root,'../aicase')},'device-id':{type:'string',default:'789'},'shop-id':{type:'string',default:'351'},'h5-origin':{type:'string'}}});
const backend=path.resolve(values['backend-dir']);
const ip=Object.values(networkInterfaces()).flat().find(n=>n&&n.family==='IPv4'&&!n.internal&&/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address))?.address;
const h5=values['h5-origin']||`http://${ip||'127.0.0.1'}:4174`;
const children=[];let server,stopping=false;
async function stop(code=0){
 if(stopping)return;stopping=true;
 for(const child of children)child.kill('SIGTERM');
 await server?.close();process.exitCode=code;
}
const run=(program,args,cwd,env={})=>{
 const child=spawn(program,args,{cwd,env:{...process.env,...env},stdio:'inherit'});children.push(child);return child;
};
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
try{
 const python=path.join(backend,'backend/.venv/bin/python');
 const args=['-u','scripts/run-direct-debug.py','--device-id',values['device-id'],'--shop-id',values['shop-id'],'--h5-origin',h5];
 const prepare=run(python,[...args,'--check'],backend);
 await new Promise((resolve,reject)=>{prepare.once('error',reject);prepare.once('exit',code=>code===0?resolve():reject(Error('后端准备失败，请检查设备编号及本地机型模板。')));});
 children.splice(children.indexOf(prepare),1);
 const token=(await readFile(path.join(backend,'backend/.local-direct-debug-token'),'utf8')).trim();
 // Only a loopback dev server holds this token. Never inject it into browser code.
 server=await createServer({configFile:false,root,clearScreen:false,
  server:{host:'127.0.0.1',port:4182,strictPort:true,proxy:{'/api/v1/debug-terminal/':{
   target:'http://127.0.0.1:8001',changeOrigin:true,
   configure(proxy){proxy.on('proxyReq',req=>{req.setHeader('Authorization',`Bearer ${token}`);req.removeHeader('cookie');});}
  }}}
 });
 await server.listen();
 for(const child of [run(python,args,backend),run(process.execPath,['server.mjs'],backend,{PORT:'4174',HOST:'0.0.0.0',DIRECT_DEBUG:'1',CATALOG_BACKEND_URL:'http://127.0.0.1:8001'})]){
  child.once('error',error=>{console.error(error.message);void stop(1);});
  child.once('exit',code=>{if(!stopping)void stop(code||1);});
 }
 console.log(`\n设备展示页：http://127.0.0.1:4182/direct.html?lang=zh-CN\n手机下单页：${h5}/?device_id=${values['device-id']}&shop_id=${values['shop-id']}&lang=zh-CN#home\n手机和电脑需连接同一网络。Ctrl+C 停止；调试订单会保留。\n`);
}catch(error){console.error(error.message);await stop(1);}
