import { createI18n } from 'vue-i18n';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { logWarn, logInfo } from '@/common/logger';
import basicEnglish from '../../src-tauri/locales/basic/en.json';
import defaultEnglish from '../../src-tauri/locales/default/en.json';
import adminEnglish from '../../src-tauri/locales/admin/en.json';
import pcEnglish from '../../src-tauri/locales/pc/en.json';

type LanguageMessages = Record<string, Record<string, string>>;

export interface LanguageItem {
    value: string,
    label: string
}

const SUPPORTED_LANGUAGES: Record<string, LanguageItem> = {
    'en': { value: 'en', label: 'English' },
    'zh': { value: 'zh', label: '简体中文' },
    'zh_TW': { value: 'zh_TW', label: '繁體中文' },
    'ja': { value: 'ja', label: '日本語' },
    'ko': { value: 'ko', label: '한국어' },
    'es': { value: 'es', label: 'Español' },
    'de': { value: 'de', label: 'Deutsch' },
    'it': { value: 'it', label: 'Italiano' },
    'pt': { value: 'pt', label: 'Português' },
    'ru': { value: 'ru', label: 'Русский' },
    'ar': { value: 'ar', label: 'العربية' },
    'he': { value: 'he', label: 'עברית' },
    'fra': { value: 'fra', label: 'Français' },
    'ind': { value: 'ind', label: 'Indonesia' },
    'th': { value: 'th', label: 'ไทย' },
    'ron': { value: 'ron', label: 'Română' },
    'uk': { value: 'uk', label: 'Українська' },
    'ku': { value: 'ku', label: 'Kurdish' },
    'pl': { value: 'pl', label: 'Polski' },
    'swe': { value: 'swe', label: 'Svenska' },
    'lao': { value: 'lao', label: 'ລາວ' },
    'mya': { value: 'mya', label: 'ဗမာလူမျိုး' },
    'mkd': { value: 'mkd', label: 'македонски' },
    'el': { value: 'el', label: 'Ελληνικά' },
    'ur': { value: 'ur', label: 'اردو' },
    'ha': { value: 'ha', label: 'Hausa' },
    'tr': { value: 'tr', label: 'Türkçe' },
    'uz': { value: 'uz', label: 'Ozbekcha' },
};

const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur'])
const DEFAULT_LOCALE = 'en';

const i18n = createI18n({
    legacy: false,
    fallbackLocale: 'en',
});

function isLocaleSupported(locale: string): boolean {
    for (const code of Object.keys(SUPPORTED_LANGUAGES)) {
        if (code === locale) {
            return true;
        }
    }
    return false;
}

function isRtlLocale(locale: string): boolean {
    const normalized = locale.trim().toLowerCase()
    if (!normalized) {
        return false
    }
    const baseLocale = normalized.split('-')[0];
    return RTL_LOCALES.has(normalized) || RTL_LOCALES.has(baseLocale)
}

function applyLocaleRtl(locale: string) {
    if (typeof document === 'undefined') {
        return;
    }

    const direction = isRtlLocale(locale) ? 'rtl' : 'ltr'
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.setAttribute('dir', direction);

    if (document.body) {
        document.body.setAttribute('lang', locale);
        document.body.setAttribute('dir', direction);
    }
}

function applyLocale(locale: string, languages: LanguageMessages) {
    logInfo(`Locales apply locale: ${locale}, languages: ${Object.keys(languages).length}`)
    // reset locale?
    const locale_old = i18n.global.locale.value
    i18n.global.setLocaleMessage(locale_old, {})
    // setup locale
    i18n.global.setLocaleMessage(locale, languages);
    i18n.global.locale.value = locale;
    applyLocaleRtl(locale);

    localStorage.setItem('locale', locale);
}

async function loadInitialLocale(): Promise<string> {
    return localStorage.getItem('locale') || DEFAULT_LOCALE;
}

async function loadLanguageData(locale: string): Promise<LanguageMessages | null> {
    return await invoke<LanguageMessages>('get_language_data', { locale: locale })
}

export async function initializeLocales() {
    logInfo('Locales initialize locale...')
    const locale = await loadInitialLocale();
    let languages: LanguageMessages | null = null;
    try {
        if (isTauri()) languages = await loadLanguageData(locale);
    } catch {
        // Language loading must not prevent the terminal's connection recovery.
        logWarn('Language resources unavailable; using bundled English');
    }
    if (languages) {
        applyLocale(locale, languages)
    } else {
        i18n.global.setLocaleMessage('en', { ...basicEnglish, ...defaultEnglish, ...adminEnglish, ...pcEnglish });
        i18n.global.locale.value = 'en';
        applyLocaleRtl('en');
    }
    return i18n;
}

export async function setLocale(locale: string) {
    logInfo(`Locales set locale: ${locale}`)
    if (!isLocaleSupported(locale)) {
        logWarn(`Locales set locale but not supported, locale: ${locale}`)
        return;
    }
    if (i18n.global.locale.value == locale) {
        return;
    }
    const languages = await loadLanguageData(locale);
    if (languages) {
        applyLocale(locale, languages)
    }
}

export function getCurrentLocale(): string {
    return i18n.global.locale.value
}

export function getAvailableLanguages(languages: string[]): LanguageItem[] {
    if (languages.length == 0) {
        languages = Object.keys(SUPPORTED_LANGUAGES);
    }
    return languages.map(v => {
        const value = v.trim();
        return {
            value: value,
            label: SUPPORTED_LANGUAGES[value]?.label || value,
        }
    })
}

// for ts import
export default i18n;

