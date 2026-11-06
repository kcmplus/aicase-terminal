
function format_time_ms(t: number): string {
    const sec = Math.floor(t / 1000)
    const m = String(Math.floor(sec / 60)).padStart(2, '0')
    const s = String(sec % 60).padStart(2, '0')
    return `${m}:${s}`
}

function format_time_hms(t: number): string {
    const sec = Math.floor(t / 1000)
    const h = String(Math.floor(sec / 3600)).padStart(2, '0')
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
    const s = String(sec % 60).padStart(2, '0')
    return `${h}:${m}:${s}`
}

export { format_time_ms, format_time_hms }
