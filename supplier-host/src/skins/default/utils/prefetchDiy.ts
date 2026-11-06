/** DIY 编辑页相关 chunk 预加载（可重复调用，浏览器会复用缓存） */
let prefetchPromise: Promise<unknown> | null = null;

export function prefetchDiyEditor(): Promise<unknown> {
  if (!prefetchPromise) {
    prefetchPromise = Promise.all([
      import('../pages/Customize.vue'),
      import('../components/EditCanvas.vue'),
      import('../components/EditableElement.vue'),
    ]).catch((err) => {
      // 允许失败后重试
      prefetchPromise = null;
      console.warn('[prefetchDiy] failed', err);
    });
  }
  return prefetchPromise;
}
