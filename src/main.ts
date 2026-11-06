import {mountTerminal} from './terminal';
import {nativeBridge} from './bridge';
import './style.css';

let bridge=nativeBridge(),preview=false;
// Only the standalone development page can opt into sample data.
if(import.meta.env.DEV&&!bridge&&new URLSearchParams(location.search).get('preview')==='1'){
  const {previewBridge}=await import('./preview');const sample=previewBridge();bridge=sample;preview=true;
  const scenario=new URLSearchParams(location.search).get('scenario')||'printing';
  if(['ready','queue','printing','offline','empty','locked','delivered','error'].includes(scenario))sample.setScenario(scenario as import('./preview').Scenario);
}
const terminal=mountTerminal(document.querySelector<HTMLDivElement>('#app')!,{bridge:bridge??undefined,preview});
if(import.meta.hot)import.meta.hot.dispose(()=>terminal.dispose());
