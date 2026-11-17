import {mountTerminal} from './terminal';
import css from './style.css?inline';

/** Embed the terminal in the supplier shell without sharing page-wide CSS. */
export function mountPopomo(host: HTMLElement,options:{debug?:boolean}={}) {
  const shadow=host.shadowRoot ?? host.attachShadow({mode:'open'});
  const style=document.createElement('style');
  style.textContent=':host{all:initial;display:block;line-height:normal;direction:ltr}'+css.replace('html,body{',':host{');
  const root=document.createElement('div');root.id='app';
  shadow.replaceChildren(style,root);
  const terminal=mountTerminal(root,{assetBase:import.meta.env.BASE_URL,debug:options.debug});
  return {dispose(){terminal.dispose();shadow.replaceChildren();}};
}
