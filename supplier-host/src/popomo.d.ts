declare module '@/popomo/terminal.js' {
  export function mountPopomo(host: HTMLElement, options?: {debug?:boolean}): {dispose():void};
}
