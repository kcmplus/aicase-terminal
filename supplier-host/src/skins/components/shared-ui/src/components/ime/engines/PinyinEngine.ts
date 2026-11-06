import type { IMEEngine, IMEOutput, IMEState } from '../types';

/**
 * Chinese Pinyin IME Engine
 * Uses pinyin-input-method-engine for pinyin→hanzi conversion
 */
export class PinyinEngine implements IMEEngine {
  private pinyinBuffer = '';
  private candidateList: string[] = [];
  private dag: any = null;
  private splitAsYinJie: ((input: string) => string[]) | null = null;

  constructor(pimeModule: any, charDict: any, phraseDict: any) {
    const { DirectedAcyclicGraph, splitAsYinJie } = pimeModule.default || pimeModule;
    const charDictData = charDict.default || charDict;
    const phraseDictData = phraseDict.default || phraseDict;
    this.dag = new DirectedAcyclicGraph(charDictData, phraseDictData);
    this.splitAsYinJie = splitAsYinJie;
  }

  input(char: string): IMEOutput {
    // 只处理字母
    if (!/^[a-zA-Z]$/.test(char)) {
      return this.commitAndPass(char);
    }

    this.pinyinBuffer += char.toLowerCase();
    this.updateCandidates();

    return {
      committed: '',
      composition: this.pinyinBuffer,
      candidates: this.candidateList,
    };
  }

  backspace(): IMEOutput {
    if (this.pinyinBuffer.length > 0) {
      this.pinyinBuffer = this.pinyinBuffer.slice(0, -1);
      if (this.pinyinBuffer.length === 0) {
        this.candidateList = [];
        return { committed: '', composition: '', candidates: [] };
      }
      this.updateCandidates();
      return {
        committed: '',
        composition: this.pinyinBuffer,
        candidates: this.candidateList,
      };
    }
    return { committed: '', composition: '', candidates: [] };
  }

  select(index: number): IMEOutput {
    if (index >= 0 && index < this.candidateList.length) {
      const selected = this.candidateList[index];
      this.pinyinBuffer = '';
      this.candidateList = [];
      return {
        committed: selected,
        composition: '',
        candidates: [],
      };
    }
    return {
      committed: '',
      composition: this.pinyinBuffer,
      candidates: this.candidateList,
    };
  }

  getState(): IMEState {
    return {
      composition: this.pinyinBuffer,
      candidates: this.candidateList,
      hasComposition: this.pinyinBuffer.length > 0,
    };
  }

  reset(): void {
    this.pinyinBuffer = '';
    this.candidateList = [];
  }

  /** 提交当前缓冲区的拼音原文 */
  commit(): IMEOutput {
    if (this.pinyinBuffer.length === 0) {
      return { committed: '', composition: '', candidates: [] };
    }
    const text = this.pinyinBuffer;
    this.pinyinBuffer = '';
    this.candidateList = [];
    return { committed: text, composition: '', candidates: [] };
  }

  private updateCandidates(): void {
    if (!this.dag || !this.splitAsYinJie || this.pinyinBuffer.length === 0) {
      this.candidateList = [];
      return;
    }

    try {
      const splits = this.splitAsYinJie(this.pinyinBuffer);
      if (!Array.isArray(splits) || splits.length === 0) {
        this.candidateList = [];
        return;
      }

      const pinyinList = splits[0];
      if (!Array.isArray(pinyinList) || pinyinList.length === 0) {
        this.candidateList = [];
        return;
      }

      const results = this.dag.query({
        yinJieList: pinyinList,
        maxNum: 30,
      });

      if (Array.isArray(results)) {
        this.candidateList = results.map((path: any) => {
          if (path.phraseInfoList && Array.isArray(path.phraseInfoList)) {
            return path.phraseInfoList.map((pi: any) => pi.phrase).join('');
          }
          if (Array.isArray(path.value)) return path.value.join('');
          if (typeof path === 'string') return path;
          return path.word || path.text || String(path);
        });
      } else {
        this.candidateList = [];
      }
    } catch (err) {
      console.error('[PinyinEngine] updateCandidates error:', err);
      this.candidateList = [];
    }
  }

  /** 提交缓冲并附加字符 */
  private commitAndPass(char: string): IMEOutput {
    if (this.pinyinBuffer.length > 0) {
      // 有候选则选第一个，否则提交拼音原文
      const committed = this.candidateList.length > 0
        ? this.candidateList[0]
        : this.pinyinBuffer;
      this.pinyinBuffer = '';
      this.candidateList = [];
      return {
        committed: committed + char,
        composition: '',
        candidates: [],
      };
    }
    return {
      committed: char,
      composition: '',
      candidates: [],
    };
  }
}
