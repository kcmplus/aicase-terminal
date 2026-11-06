import type { IMEEngine, IMEOutput, IMEState } from '../types';

export type KanaMode = 'hiragana' | 'katakana';

/** 假名读音 → 汉字/中文写法 */
export type JaKanjiDict = Record<string, string[]>;

const MAX_KANJI_CANDIDATES = 5;

/**
 * Japanese IME Engine
 * Uses wanakana for romaji→kana conversion, plus a reading→kanji dict for 汉字 candidates
 */
export class JapaneseEngine implements IMEEngine {
  private romajiBuffer = '';
  private wanakana: any = null;
  private mode: KanaMode = 'hiragana';
  private kanjiDict: JaKanjiDict;

  constructor(wanakanaModule: any, kanjiDict: JaKanjiDict = {}) {
    this.wanakana = wanakanaModule;
    this.kanjiDict = kanjiDict;
  }

  setMode(mode: KanaMode) {
    this.mode = mode;
  }

  getMode(): KanaMode {
    return this.mode;
  }

  input(char: string): IMEOutput {
    // 只处理字母键
    if (!/^[a-zA-Z]$/.test(char)) {
      // 非字母直接提交 buffer + 该字符
      const flushed = this.romajiBuffer.length > 0 ? this.convertToKana(this.romajiBuffer) : '';
      this.romajiBuffer = '';
      return {
        committed: flushed + char,
        composition: '',
        candidates: [],
      };
    }

    this.romajiBuffer += char.toLowerCase();

    // 尝试转换
    const kana = this.convertToKana(this.romajiBuffer);

    // wanakana 会把可识别的罗马字转成假名，不可识别的保持原样
    // 检查是否有已转换的假名（即 buffer 中有非 ASCII 字符）
    const asciiPart = this.extractTrailingRomaji(kana);
    const kanaPart = kana.slice(0, kana.length - asciiPart.length);

    if (kanaPart.length > 0) {
      // 有已完成的假名，显示候选词让用户确认
      const candidates = this.generateCandidates(kanaPart);
      // 保留 romajiBuffer，在 select 时再清空
      return {
        committed: '',
        composition: kanaPart + (asciiPart.length > 0 ? this.convertToKana(asciiPart) : ''),
        candidates,
      };
    }

    // 全部还在组合中
    return {
      committed: '',
      composition: kana,
      candidates: [],
    };
  }

  backspace(): IMEOutput {
    if (this.romajiBuffer.length > 0) {
      this.romajiBuffer = this.romajiBuffer.slice(0, -1);
      if (this.romajiBuffer.length === 0) {
        return { committed: '', composition: '', candidates: [] };
      }
      const kana = this.convertToKana(this.romajiBuffer);
      const asciiPart = this.extractTrailingRomaji(kana);
      const kanaPart = kana.slice(0, kana.length - asciiPart.length);
      return {
        committed: '',
        composition: kana,
        candidates: kanaPart.length > 0 ? this.generateCandidates(kanaPart) : [],
      };
    }
    return { committed: '', composition: '', candidates: [] };
  }

  select(index: number): IMEOutput {
    const comp = this.getState().composition;
    const asciiPart = this.extractTrailingRomaji(comp);
    const kanaPart = comp.slice(0, comp.length - asciiPart.length);
    const candidates = this.generateCandidates(kanaPart);

    if (index >= 0 && index < candidates.length) {
      const selected = candidates[index];
      // 保留未完成转换的罗马字尾部，其余清空
      this.romajiBuffer = asciiPart.toLowerCase();
      return {
        committed: selected,
        composition: this.romajiBuffer ? this.convertToKana(this.romajiBuffer) : '',
        candidates: [],
      };
    }

    return { committed: '', composition: comp, candidates };
  }

  getState(): IMEState {
    const comp = this.romajiBuffer.length > 0 ? this.convertToKana(this.romajiBuffer) : '';
    const asciiPart = this.extractTrailingRomaji(comp);
    const kanaPart = comp.slice(0, comp.length - asciiPart.length);
    return {
      composition: comp,
      candidates: kanaPart.length > 0 ? this.generateCandidates(kanaPart) : [],
      hasComposition: this.romajiBuffer.length > 0,
    };
  }

  reset(): void {
    this.romajiBuffer = '';
  }

  /** 提交当前 buffer 中的假名 */
  commit(): IMEOutput {
    if (this.romajiBuffer.length === 0) {
      return { committed: '', composition: '', candidates: [] };
    }
    const text = this.convertToKana(this.romajiBuffer);
    this.romajiBuffer = '';
    return { committed: text, composition: '', candidates: [] };
  }

  /** 生成候选词列表：假名 + 汉字/中文写法（如 はちみつ → 蜂蜜） */
  private generateCandidates(kana: string): string[] {
    if (!kana || /[a-zA-Z]/.test(kana)) {
      return [];
    }

    const candidates: string[] = [];
    const hiragana = this.wanakana.toHiragana(kana);
    const katakana = this.wanakana.toKatakana(hiragana);

    // 当前读音假名优先，便于确认输入
    if (this.mode === 'hiragana') {
      candidates.push(hiragana);
    } else {
      candidates.push(katakana);
    }

    // 汉字 / 中文提示紧随其后（用户主要选择目标）
    const kanjiList = this.kanjiDict[hiragana];
    if (kanjiList?.length) {
      for (const kanji of kanjiList.slice(0, MAX_KANJI_CANDIDATES)) {
        if (kanji && !candidates.includes(kanji)) {
          candidates.push(kanji);
        }
      }
    }

    // 另一种假名形式
    const otherKana = this.mode === 'hiragana' ? katakana : hiragana;
    if (otherKana !== candidates[0] && !candidates.includes(otherKana)) {
      candidates.push(otherKana);
    }

    return candidates;
  }

  private convertToKana(romaji: string): string {
    if (this.mode === 'katakana') {
      return this.wanakana.toKatakana(romaji, { IMEMode: true });
    }
    return this.wanakana.toHiragana(romaji, { IMEMode: true });
  }

  /** 提取尾部的 ASCII romaji 部分（未完成转换的） */
  private extractTrailingRomaji(str: string): string {
    let i = str.length;
    while (i > 0 && /[a-zA-Z]/.test(str[i - 1])) {
      i--;
    }
    return str.slice(i);
  }
}
