import './skins/components/styles/main.css'
import 'uno.css';

function show_launch_failed(msg: unknown) {
    const container = document.getElementById('app')
    if (container) {
        container.innerHTML = `
    <div style="width:100vw;height:100vh;display:flex;flex-direction:column;align-items:center;
    justify-content:center;font-size:16px;color:#f53f3f;box-sizing:border-box;padding:40px;">
      <h3 style="margin:0 0 16px 0;">App launch failed</h3>
      <p style="white-space:pre-wrap;margin:0;max-width:800px;word-break:break-all;">${msg}</p>
    </div>
    `
    }
}

async function load_bootstrap(skin_id: string): Promise<() => Promise<void>> {
    if (skin_id === 'default') {
        return (await import('@/skins/default/main')).default
    } else {
        return (await import('@/skins/default/main')).default
    }
}

async function start() {
    const skin_id = import.meta.env.VITE_SKIN_ID || 'default'
    let retry_count = 0;
    async function launch() {
        try {
            const bootstrap = await load_bootstrap(skin_id);
            await bootstrap();
        } catch (err) {
            retry_count++;
            if (retry_count < 3) {
                setTimeout(launch, 100);
            } else {
                show_launch_failed(err)
            }
        }
    }
    await launch();
}

start();
