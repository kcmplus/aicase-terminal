import { defineConfig, presetAttributify, presetUno } from 'unocss'
import presetRemToPx from '@unocss/preset-rem-to-px'

export default defineConfig({
    presets: [
        presetUno(),
        presetAttributify(),
        presetRemToPx({
            baseFontSize: 4,
        }),
    ],
    shortcuts: {
        'bg-img-full': 'bg-no-repeat bg-center bg-[length:100%_100%]',
    }
})
