import { isTauri, invoke } from '@tauri-apps/api/core';

const LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const log_config = {
    level: LEVELS.debug,
};

function log(level: 'debug' | 'info' | 'warn' | 'error', ...args: any[]): void {
    const log_level = LEVELS[level]
    if (log_level < log_config.level) return;

    if (isTauri()) {
        const log = args.map(i =>
            typeof i === 'object' ? JSON.stringify(i, null, 2) : i
        ).join(' ')
        switch (log_level) {
            case LEVELS.debug:
                invoke('log_debug', { log: log })
                break;
            case LEVELS.info:
                invoke('log_info', { log: log })
                break;
            case LEVELS.warn:
                invoke('log_warn', { log: log })
                break;
            case LEVELS.error:
                invoke('log_error', { log: log })
                break;
            default:
                invoke('log_debug', { log: log })
        }
    } else {
        console[level](...args)
    }
}

export function setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    log_config.level = LEVELS[level];
}

export function logDebug(...args: any[]): void {
    log('debug', ...args);
}

export function logInfo(...args: any[]): void {
    log('info', ...args);
}

export function logWarn(...args: any[]): void {
    log('warn', ...args);
}

export function logError(...args: any[]): void {
    log('error', ...args);
}