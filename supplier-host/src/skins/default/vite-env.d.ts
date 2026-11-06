/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface HTMLElement {
    /** 素材库滚动区挂载的 ResizeObserver，卸载时用于 disconnect */
    _galleryRo?: ResizeObserver;
}