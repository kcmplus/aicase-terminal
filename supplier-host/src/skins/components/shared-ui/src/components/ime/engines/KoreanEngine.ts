import type { IMEEngine, IMEOutput, IMEState } from '../types';

/**
 * Korean IME Engine
 * Uses hangul-js for jamo→syllable composition
 */
export class KoreanEngine implements IMEEngine {
  private buffer: string[] = [];
  private Hangul: any = null;

  constructor(hangulModule: any) {
    this.Hangul = hangulModule.default || hangulModule;
  }

  input(char: string): IMEOutput {
    this.buffer.push(char);
    const assembled = this.Hangul.assemble(this.buffer);
    // 检查是否有已完成的音节（只保留最后的组合中字符）
    const disassembled = this.Hangul.disassemble(assembled);
    // hangul-js assemble 会将 jamo 组合成音节
    // 如果组合结果长度 > 1，说明前面的音节已完成
    if (assembled.length > 1) {
      const committed = assembled.slice(0, -1);
      // 保留最后一个字符的 jamo 作为新的 buffer
      const lastChar = assembled.slice(-1);
      this.buffer = this.Hangul.disassemble(lastChar);
      return {
        committed,
        composition: lastChar,
        candidates: [],
      };
    }

    return {
      committed: '',
      composition: assembled,
      candidates: [],
    };
  }

  backspace(): IMEOutput {
    if (this.buffer.length > 0) {
      this.buffer.pop();
      if (this.buffer.length === 0) {
        return { committed: '', composition: '', candidates: [] };
      }
      const assembled = this.Hangul.assemble(this.buffer);
      return { committed: '', composition: assembled, candidates: [] };
    }
    return { committed: '', composition: '', candidates: [] };
  }

  select(_index: number): IMEOutput {
    // 韩语无候选词
    return { committed: '', composition: this.getState().composition, candidates: [] };
  }

  getState(): IMEState {
    const comp = this.buffer.length > 0 ? this.Hangul.assemble(this.buffer) : '';
    return {
      composition: comp,
      candidates: [],
      hasComposition: this.buffer.length > 0,
    };
  }

  reset(): void {
    this.buffer = [];
  }

  /** 提交当前组合中的文本 */
  commit(): IMEOutput {
    if (this.buffer.length === 0) {
      return { committed: '', composition: '', candidates: [] };
    }
    const text = this.Hangul.assemble(this.buffer);
    this.buffer = [];
    return { committed: text, composition: '', candidates: [] };
  }
}
