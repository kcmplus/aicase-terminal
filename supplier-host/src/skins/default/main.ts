import { createApp } from "vue";

import App from './App.vue';
import router from './router/index.ts';
import './theme.css'

import { initializeLocales } from "@/common/locales";
import { logWarn } from '@/common/logger';

window.onerror = async (message, source, lineno, colno, error) => {
    const stack = error?.stack ?? 'No stack trace';
    logWarn(`[WindowSyncError] Msg:${message} Source:${source} Line:${lineno}:${colno}\nStack:${stack}`);
    return true;
};

window.addEventListener('unhandledrejection', async (event) => {
    event.preventDefault();
    const reason = event.reason;
    const stack = reason?.stack ?? String(reason);
    logWarn(`[PromiseReject] Reason:${reason}\nStack:${stack}`);
});

document.addEventListener('error', async (e) => {
    const target = e.target as HTMLImageElement | HTMLScriptElement;
    const tag = target.tagName.toLowerCase();

    if (tag !== 'IMG' && tag !== 'SCRIPT') return;

    const rawUrl = target.src;
    const plainUrl = decodeURIComponent(rawUrl);
    const resType = tag === 'IMG' ? 'image' : 'script';

    await logWarn(`[ResourceLoadFail][${resType}] url:${plainUrl}`);
}, true);

async function bootstrap() {
    const i18n = await initializeLocales();
    const app = createApp(App);

    app.config.errorHandler = (err, instance, info) => {
        const component = instance?.$options?.name || 'UnknownComponent';
        let stack = '';
        if (err instanceof Error) {
            stack = err.stack ?? String(err);
        } else {
            stack = String(err);
        }
        logWarn(`[VueRenderError] Component:${component} Info:${info}\nErrStack:${stack}`);
    };

    app.config.warnHandler = (msg, instance, trace) => {
        const component = instance?.$options?.name || 'UnknownComponent';
        logWarn(`[VueWarn] Component:${component} Msg:${msg} Trace:${trace}`);
    };

    app.use(router).use(i18n);
    app.mount('#app');
}

export default bootstrap;
