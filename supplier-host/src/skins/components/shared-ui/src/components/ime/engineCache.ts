import type { IMEEngine } from './types';
import { KoreanEngine } from './engines/KoreanEngine';
import { JapaneseEngine } from './engines/JapaneseEngine';
import { PinyinEngine } from './engines/PinyinEngine';
import { createZhuyinEngine } from './engines/ZhuyinEngine';
// 预先静态导入字典数据（支持 TypeScript resolveJsonModule）
import charDict from 'pinyin-input-method-engine/dict/dag_char.json';
import phraseDict from 'pinyin-input-method-engine/dict/dag_phrase.json';
import jaKanjiDict from './dict/jaKanji.json';

// ── 模块级单例缓存 ──

const cache = new Map<string, IMEEngine>();
const pending = new Map<string, Promise<IMEEngine>>();

// ── 内置引擎工厂 ──

const builtinFactories: Record<string, () => Promise<IMEEngine>> = {
  ko: async () => {
    const hangul = await import('hangul-js');
    return new KoreanEngine(hangul);
  },
  ja: async () => {
    const wanakana = await import('wanakana');
    return new JapaneseEngine(wanakana, jaKanjiDict);
  },
  zh: async () => {
    const pime = await import('pinyin-input-method-engine');
    return new PinyinEngine(pime, charDict, phraseDict);
  },
  'zh-TW': async () => {
    // @ts-ignore
    const { InputController } = await import('@openvanilla/mcbopomofoweb');
    return createZhuyinEngine(InputController);
  },
};

/**
 * 获取或创建引擎（从缓存返回，无缓存则创建并缓存）
 * 返回的引擎已 reset，可直接使用
 */
export async function getOrCreateEngine(lang: string): Promise<IMEEngine | null> {
  // 命中缓存：reset 后返回
  if (cache.has(lang)) {
    const engine = cache.get(lang)!;
    engine.reset();
    return engine;
  }

  // 正在创建中：等待同一个 Promise
  if (pending.has(lang)) {
    const engine = await pending.get(lang)!;
    engine.reset();
    return engine;
  }

  const factory = builtinFactories[lang];
  if (!factory) return null;

  const promise = factory().then(engine => {
    cache.set(lang, engine);
    pending.delete(lang);
    return engine;
  }).catch(err => {
    console.error(`[IME] Failed to create engine for ${lang}:`, err);
    pending.delete(lang);
    throw err;
  });

  pending.set(lang, promise);

  try {
    const engine = await promise;
    return engine;
  } catch {
    return null;
  }
}

/**
 * 检查指定语言是否有内置引擎工厂
 */
export function hasBuiltinEngine(lang: string): boolean {
  return lang in builtinFactories;
}

/**
 * 预加载所有内置引擎（在应用启动时调用，后续使用时直接从缓存取）
 */
export async function preloadIMEEngines(): Promise<void> {
  const langs = Object.keys(builtinFactories);
  await Promise.allSettled(langs.map(lang => getOrCreateEngine(lang)));
}
