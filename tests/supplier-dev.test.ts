import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,existsSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

function project(){
 const base=realpathSync(mkdtempSync(join(tmpdir(),'supplier debug '))),root=join(base,'phonecase-diy-gy');
 for(const dir of ['scripts','src-tauri','src/popomo','node_modules/@tauri-apps/cli'])mkdirSync(join(root,dir),{recursive:true});
 copyFileSync(new URL('../supplier-host/scripts/dev-device.mjs',import.meta.url),join(root,'scripts/dev-device.mjs'));
 writeFileSync(join(root,'src-tauri/Cargo.toml'),'[dependencies]\nphonecase-core = { path = "../../phonecase-core" }');
 writeFileSync(join(root,'src-tauri/tauri.device-dev.json'),'{}');
 writeFileSync(join(root,'src/popomo/terminal.js'),'');
 mkdirSync(join(base,'phonecase-core'));writeFileSync(join(base,'phonecase-core/Cargo.toml'),'');
 writeFileSync(join(root,'node_modules/@tauri-apps/cli/tauri.js'),`require('node:fs').writeFileSync('launch.json',JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),mock:process.env.VITE_MOCK,skin:process.env.SKIN_ID,uiSkin:process.env.VITE_SKIN_ID}));`);
 const run=(...args:string[])=>spawnSync(process.execPath,[join(root,'scripts/dev-device.mjs'),...args],{cwd:root,encoding:'utf8',timeout:10000,env:{...process.env,VITE_MOCK:'1',SKIN_ID:'other',VITE_SKIN_ID:'other'}});
 return {base,root,run,clean:()=>rmSync(base,{recursive:true,force:true})};
}
test('supplier debug launcher works standalone, clears mock and forwards device config paths with spaces',()=>{
 const p=project();try{
  const config=join(p.root,'device config.toml');writeFileSync(config,'');
  const result=p.run('--device-config',config);assert.equal(result.status,0,result.stderr);
  const launched=JSON.parse(readFileSync(join(p.root,'launch.json'),'utf8'));
  assert.deepEqual(launched,{args:['dev','--config',join(p.root,'src-tauri/tauri.device-dev.json'),'--','--','-c',config],cwd:p.root,mock:'0',skin:'default',uiSkin:'default'});
 }finally{p.clean();}
});
test('supplier debug preflight does not start Tauri and reports the missing core',()=>{
 const p=project();try{
  assert.equal(p.run('--check').status,0);assert.equal(existsSync(join(p.root,'launch.json')),false);
  rmSync(join(p.base,'phonecase-core'),{recursive:true});
  const result=p.run();assert.equal(result.status,1);assert.match(result.stderr,/Missing supplier core/);assert.match(result.stderr,/npm run dev:mock/);
  assert.equal(existsSync(join(p.root,'launch.json')),false);
 }finally{p.clean();}
});
test('supplier debug rejects missing assets, missing config and unknown options before starting',()=>{
 const p=project();try{
  assert.match(p.run('--device-config','missing.toml').stderr,/Device configuration does not exist/);
  assert.match(p.run('--device-config').stderr,/incomplete option/);
  assert.match(p.run('--release').stderr,/Unknown/);
  rmSync(join(p.root,'src/popomo/terminal.js'));
  assert.match(p.run().stderr,/Missing src\/popomo\/terminal.js/);
  assert.equal(existsSync(join(p.root,'launch.json')),false);
 }finally{p.clean();}
});
