import {mountTerminal} from '../terminal';
import {directBridge} from './bridge';
import '../style.css';

if(!import.meta.env.DEV)throw Error('Direct backend mode is development-only.');
const status=document.querySelector<HTMLElement>('#direct-connection')!;
const bridge=directBridge(fetch,connected=>{status.textContent=connected?'后端已连接':'后端连接中／已断开';});
const terminal=mountTerminal(document.querySelector<HTMLDivElement>('#app')!,{bridge,debug:true});
const dispose=()=>{bridge.dispose();terminal.dispose();};
window.addEventListener('pagehide',dispose);
if(import.meta.hot)import.meta.hot.dispose(dispose);
