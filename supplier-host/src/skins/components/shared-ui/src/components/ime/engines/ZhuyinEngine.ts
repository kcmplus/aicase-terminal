import type { IMEEngine, IMEOutput, IMEState } from '../types';

/** Bopomofo symbol → QWERTY key (Standard layout) */
const BOPOMOFO_TO_QWERTY: Record<string, string> = {
  'ㄅ': '1', 'ㄆ': 'q', 'ㄇ': 'a', 'ㄈ': 'z',
  'ㄉ': '2', 'ㄊ': 'w', 'ㄋ': 's', 'ㄌ': 'x',
  'ㄍ': 'e', 'ㄎ': 'd', 'ㄏ': 'c',
  'ㄐ': 'r', 'ㄑ': 'f', 'ㄒ': 'v',
  'ㄓ': '5', 'ㄔ': 't', 'ㄕ': 'g', 'ㄖ': 'b',
  'ㄗ': 'y', 'ㄘ': 'h', 'ㄙ': 'n',
  'ㄧ': 'u', 'ㄨ': 'j', 'ㄩ': 'm',
  'ㄚ': '8', 'ㄛ': 'i', 'ㄜ': 'k', 'ㄝ': ',',
  'ㄞ': '9', 'ㄟ': 'o', 'ㄠ': 'l', 'ㄡ': '.',
  'ㄢ': '0', 'ㄣ': 'p', 'ㄤ': ';', 'ㄥ': '/', 'ㄦ': '-',
  'ˊ': '6', 'ˇ': '3', 'ˋ': '4', '˙': '7',
};

/**
 * Traditional Chinese Zhuyin (Bopomofo) IME Engine
 * Uses McBopomofoWeb InputController for 注音→繁體漢字 conversion
 */
export class ZhuyinEngine implements IMEEngine {
  private controller: any = null;
  private compositionBuffer = '';
  private candidateList: string[] = [];
  private pendingCommit = '';

  /** @internal */
  _init(controller: any): void {
    this.controller = controller;
  }

  input(char: string): IMEOutput {
    if (!this.controller) {
      return { committed: char, composition: '', candidates: [] };
    }

    this.pendingCommit = '';
    const qwertyKey = BOPOMOFO_TO_QWERTY[char];

    if (qwertyKey) {
      // Bopomofo symbol → convert to QWERTY and send to McBopomofoWeb
      this.controller.simpleKeyboardEvent(qwertyKey, false, false);
    } else {
      // Non-bopomofo char (digits, punctuation, etc.): flush and output directly
      const flushed = this.forceCommitBuffer();
      return { committed: flushed + char, composition: '', candidates: [] };
    }

    return {
      committed: this.pendingCommit,
      composition: this.compositionBuffer,
      candidates: [...this.candidateList],
    };
  }

  backspace(): IMEOutput {
    if (!this.controller) {
      return { committed: '', composition: '', candidates: [] };
    }
    this.pendingCommit = '';
    if (this.compositionBuffer.length > 0 || this.candidateList.length > 0) {
      this.controller.simpleKeyboardEvent('{bksp}', false, false);
    }
    return {
      committed: this.pendingCommit,
      composition: this.compositionBuffer,
      candidates: [...this.candidateList],
    };
  }

  select(index: number): IMEOutput {
    if (!this.controller || index < 0 || index >= this.candidateList.length) {
      return {
        committed: '',
        composition: this.compositionBuffer,
        candidates: [...this.candidateList],
      };
    }
    this.pendingCommit = '';
    this.controller.selectCandidateAtIndex(index);
    return {
      committed: this.pendingCommit,
      composition: this.compositionBuffer,
      candidates: [...this.candidateList],
    };
  }

  getState(): IMEState {
    return {
      composition: this.compositionBuffer,
      candidates: [...this.candidateList],
      hasComposition: this.compositionBuffer.length > 0 || this.candidateList.length > 0,
    };
  }

  reset(): void {
    this.compositionBuffer = '';
    this.candidateList = [];
    this.pendingCommit = '';
    if (this.controller) {
      this.controller.reset();
    }
  }

  destroy(): void {
    this.reset();
    this.controller = null;
  }

  commit(): IMEOutput {
    const text = this.forceCommitBuffer();
    return { committed: text, composition: '', candidates: [] };
  }

  private forceCommitBuffer(): string {
    if (!this.controller) return '';
    this.pendingCommit = '';
    if (this.compositionBuffer.length > 0 || this.candidateList.length > 0) {
      this.controller.simpleKeyboardEvent('{enter}', false, false);
      return this.pendingCommit;
    }
    return '';
  }

  /** @internal Called by InputUI bridge */
  _onCommit(text: string): void {
    this.pendingCommit += text;
  }

  /** @internal Called by InputUI bridge */
  _onUpdate(composition: string, candidates: string[]): void {
    this.compositionBuffer = composition;
    this.candidateList = candidates;
  }

  /** @internal Called by InputUI bridge */
  _onReset(): void {
    this.compositionBuffer = '';
    this.candidateList = [];
  }
}

/**
 * Create a ZhuyinEngine with McBopomofoWeb InputController
 */
export function createZhuyinEngine(InputControllerClass: any): ZhuyinEngine {
  const engine = new ZhuyinEngine();

  const ui = {
    reset() {
      engine._onReset();
    },
    commitString(text: string) {
      engine._onCommit(text);
    },
    update(stateJSON: string) {
      try {
        const state = JSON.parse(stateJSON);
        const comp = Array.isArray(state.composingBuffer)
          ? state.composingBuffer.map((b: any) => b.text ?? '').join('')
          : '';
        const candidates = Array.isArray(state.candidates)
          ? state.candidates
              .map((c: any) => c.candidate?.value ?? c.value ?? '')
              .filter((v: string) => v.length > 0)
          : [];
        engine._onUpdate(comp, candidates);
      } catch { /* ignore parse errors */ }
    },
  };

  const controller = new InputControllerClass(ui);
  controller.setKeyboardLayout('Standard');
  controller.setLanguageCode('zh-TW');
  controller.setCandidateKeysCount(9);
  engine._init(controller);

  return engine;
}
