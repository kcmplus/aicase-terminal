import {existsSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const usage='npm run dev:device [-- --check] [-- --device-config "absolute/path/config-dev.toml"]';
try {
  let check=false,deviceConfig;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--help'){console.log(usage);process.exit(0);}
    else if(args[i]==='--check')check=true;
    else if(args[i]==='--device-config'&&args[i+1]&&!args[i+1].startsWith('--'))deviceConfig=resolve(process.cwd(),args[++i]);
    else throw Error(`Unknown or incomplete option: ${args[i]}\n${usage}`);
  }
  const cli=resolve(root,'node_modules/@tauri-apps/cli/tauri.js');
  const manifest=resolve(root,'src-tauri/Cargo.toml');
  const config=resolve(root,'src-tauri/tauri.device-dev.json');
  const missing=[];
  if(!existsSync(cli))missing.push('Run npm ci in this project first (Node.js 22.18+ or 24.11+).');
  if(!existsSync(resolve(root,'src/popomo/terminal.js')))missing.push('Missing src/popomo/terminal.js. Use the supplier integration ZIP, or run npm run build:embedded from the aicase-terminal repository.');
  if(!existsSync(config))missing.push(`Missing debug configuration: ${config}`);
  const cargo=readFileSync(manifest,'utf8');
  const corePath=cargo.match(/phonecase-core\s*=\s*\{[^}]*\bpath\s*=\s*"([^"]+)"/);
  if(!corePath)missing.push('Expected the supplier phonecase-core local path dependency in src-tauri/Cargo.toml.');
  else {
    const core=resolve(dirname(manifest),corePath[1],'Cargo.toml');
    if(!existsSync(core))missing.push(`Missing supplier core: ${core}\nKeep phonecase-core and its dependencies in the supplier workspace. For browser-only simulation use npm run dev:mock.`);
  }
  if(deviceConfig&&!existsSync(deviceConfig))missing.push(`Device configuration does not exist: ${deviceConfig}`);
  if(missing.length)throw Error(missing.join('\n\n'));
  console.log('Supplier project files checked. This mode uses the real core and hardware, without mock.');
  console.log(deviceConfig?`Device configuration: ${deviceConfig}`:'The native host will use its default config-dev.toml. Use --device-config to select a supplier configuration.');
  if(!check) {
    const command=[cli,'dev','--config',config];
    if(deviceConfig)command.push('--','--','-c',deviceConfig);
    // Launch Node directly: works on Windows without shell quoting or npm.cmd.
    const child=spawn(process.execPath,command,{cwd:root,stdio:'inherit',env:{...process.env,VITE_MOCK:'0',VITE_SKIN_ID:'default',SKIN_ID:'default'}});
    child.on('error',error=>{console.error(error.message);process.exitCode=1;});
    child.on('exit',(code,signal)=>{process.exitCode=code??(signal==='SIGINT'?130:1);});
    // Keep the parent alive until Tauri cleans up the Vite child on Ctrl+C.
    process.on('SIGINT',()=>{child.kill('SIGINT');});
    process.on('SIGTERM',()=>{child.kill('SIGTERM');});
  }
} catch(error) {
  console.error(`[dev:device] ${error instanceof Error?error.message:String(error)}`);
  process.exitCode=1;
}
