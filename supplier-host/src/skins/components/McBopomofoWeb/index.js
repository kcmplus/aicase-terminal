/**
 * Simplified McBopomofoWeb InputController for Traditional Chinese Zhuyin input
 * This is a lightweight mock implementation for testing purposes.
 */

// 注音到汉字的映射（简化版）
const ZHUYIN_MAP = {
  'ㄅ': ['吧', '把', '爸', '巴', '拔', '芭', '霸', '捌', '靶', '疤'],
  'ㄆ': ['怕', '爬', '帕', '琶', '杷', '耙', '啪', '葩', '趴', '派'],
  'ㄇ': ['妈', '麻', '马', '吗', '码', '骂', '嘛', '玛', '蟆', '秣'],
  'ㄈ': ['发', '法', '花', '华', '化', '伐', '筏', '罚', '阀', '砝'],
  'ㄉ': ['大', '打', '达', '答', '搭', '妲', '瘩', '靼', '沓', '怛'],
  'ㄊ': ['他', '她', '它', '塔', '踏', '塌', '拓', '挞', '嗒', '獭'],
  'ㄋ': ['那', '哪', '拿', '娜', '纳', '呐', '捺', '钠', '肭', '衲'],
  'ㄌ': ['拉', '啦', '来', '乐', '了', '力', '里', '理', '利', '例'],
  'ㄍ': ['个', '哥', '歌', '各', '格', '隔', '革', '葛', '阁', '胳'],
  'ㄎ': ['可', '克', '客', '课', '颗', '刻', '壳', '咳', '珂', '轲'],
  'ㄏ': ['和', '合', '河', '何', '喝', '贺', '荷', '核', '赫', '褐'],
  'ㄐ': ['机', '几', '季', '记', '纪', '技', '系', '忌', '寄', '既'],
  'ㄑ': ['起', '气', '奇', '期', '其', '棋', '旗', '歧', '崎', '琪'],
  'ㄒ': ['西', '希', '喜', '洗', '细', '习', '席', '惜', '夕', '隙'],
  'ㄓ': ['之', '知', '支', '直', '指', '纸', '志', '致', '治', '制'],
  'ㄔ': ['吃', '池', '迟', '持', '尺', '赤', '斥', '痴', '翅', '耻'],
  'ㄕ': ['是', '时', '事', '师', '诗', '史', '使', '市', '视', '室'],
  'ㄖ': ['日', '入', '如', '乳', '汝', '儒', '辱', '褥', '洳', '挐'],
  'ㄗ': ['子', '字', '自', '资', '紫', '姿', '滋', '籽', '姊', '梓'],
  'ㄘ': ['此', '次', '词', '辞', '磁', '慈', '刺', '赐', '伺', '疵'],
  'ㄙ': ['司', '思', '丝', '师', '私', '斯', '撕', '嘶', '厮', '澌'],
  'ㄧ': ['一', '以', '已', '也', '意', '义', '医', '依', '宜', '伊'],
  'ㄨ': ['五', '无', '不', '武', '物', '舞', '乌', '污', '巫', '诬'],
  'ㄩ': ['于', '与', '雨', '语', '玉', '遇', '余', '鱼', '渔', '愉'],
  'ㄚ': ['阿', '啊', '亚', '牙', '雅', '芽', '衙', '鸦', '蚜', '岈'],
  'ㄛ': ['哦', '我', '卧', '饿', '鄂', '娥', '鹅', '恶', '讹', '峨'],
  'ㄜ': ['俄', '额', '饿', '峨', '蛾', '讹', '厄', '扼', '谔', '鄂'],
  'ㄝ': ['也', '夜', '野', '业', '叶', '页', '液', '腋', '谒', '靥'],
  'ㄞ': ['爱', '艾', '矮', '哀', '唉', '碍', '暧', '瑷', '霭', '嗳'],
  'ㄟ': ['诶', '杯', '北', '背', '贝', '辈', '悲', '被', '备', '惫'],
  'ㄠ': ['奥', '敖', '熬', '澳', '傲', '翱', '坳', '敖', '聱', '螯'],
  'ㄡ': ['欧', '偶', '呕', '鸥', '藕', '殴', '瓯', '讴', '耦', '怄'],
  'ㄢ': ['安', '岸', '按', '案', '暗', '氨', '俺', '谙', '埯', '铵'],
  'ㄣ': ['恩', '恩', '摁', '嗯', '蒽', '摁', '煾', '鞥', '昷', '欯'],
  'ㄤ': ['昂', '肮', '盎', '卬', '醠', '岇', '峎', '昻', '姎', '昻'],
  'ㄥ': ['亨', '哼', '恒', '横', '衡', '桁', '珩', '蘅', '鵆', '姮'],
  'ㄦ': ['儿', '尔', '二', '耳', '而', '饵', '洱', '迩', '铒', '珥'],
  'ˊ': [],
  'ˇ': [],
  'ˋ': [],
  '˙': [],
};

// QWERTY到注音的映射（Standard布局）
const QWERTY_TO_ZHUYIN = {
  '1': 'ㄅ', 'q': 'ㄆ', 'a': 'ㄇ', 'z': 'ㄈ',
  '2': 'ㄉ', 'w': 'ㄊ', 's': 'ㄋ', 'x': 'ㄌ',
  'e': 'ㄍ', 'd': 'ㄎ', 'c': 'ㄏ',
  'r': 'ㄐ', 'f': 'ㄑ', 'v': 'ㄒ',
  '5': 'ㄓ', 't': 'ㄔ', 'g': 'ㄕ', 'b': 'ㄖ',
  'y': 'ㄗ', 'h': 'ㄘ', 'n': 'ㄙ',
  'u': 'ㄧ', 'j': 'ㄨ', 'm': 'ㄩ',
  '8': 'ㄚ', 'i': 'ㄛ', 'k': 'ㄜ', ',': 'ㄝ',
  '9': 'ㄞ', 'o': 'ㄟ', 'l': 'ㄠ', '.': 'ㄡ',
  '0': 'ㄢ', 'p': 'ㄣ', ';': 'ㄤ', '/': 'ㄥ', '-': 'ㄦ',
  '6': 'ˊ', '3': 'ˇ', '4': 'ˋ', '7': '˙',
};

export class InputController {
  constructor(ui) {
    this.ui = ui;
    this.composingBuffer = '';
    this.candidates = [];
    this.keyboardLayout = 'Standard';
    this.languageCode = 'zh-TW';
    this.candidateKeysCount = 9;
  }

  setKeyboardLayout(layout) {
    this.keyboardLayout = layout;
  }

  setLanguageCode(code) {
    this.languageCode = code;
  }

  setCandidateKeysCount(count) {
    this.candidateKeysCount = count;
  }

  simpleKeyboardEvent(key, shift, alt) {
    if (key === '{bksp}') {
      // 退格
      if (this.composingBuffer.length > 0) {
        this.composingBuffer = this.composingBuffer.slice(0, -1);
      }
    } else if (key === '{enter}') {
      // 回车，提交当前内容
      if (this.composingBuffer.length > 0) {
        const text = this.composingBuffer || (this.candidates[0] || '');
        this.ui.commitString(text);
      }
      this.reset();
      return;
    } else if (key === '{esc}') {
      // 取消
      this.reset();
      return;
    } else {
      // 输入字符
      const zhuyin = QWERTY_TO_ZHUYIN[key.toLowerCase()];
      if (zhuyin) {
        this.composingBuffer += zhuyin;
        // 更新候选词
        this.updateCandidates();
      } else {
        // 其他字符，直接提交
        if (this.composingBuffer.length > 0) {
          this.ui.commitString(this.composingBuffer);
        }
        this.ui.commitString(key);
        this.reset();
        return;
      }
    }

    this.notifyUI();
  }

  selectCandidateAtIndex(index) {
    if (index >= 0 && index < this.candidates.length) {
      this.ui.commitString(this.candidates[index]);
    }
    this.reset();
  }

  updateCandidates() {
    if (!this.composingBuffer) {
      this.candidates = [];
      return;
    }

    // 简化的候选词生成：取最后一个注音的候选词
    const lastChar = this.composingBuffer.slice(-1);
    this.candidates = ZHUYIN_MAP[lastChar] || [];
    if (this.candidateKeysCount > 0) {
      this.candidates = this.candidates.slice(0, this.candidateKeysCount);
    }
  }

  notifyUI() {
    const state = {
      composingBuffer: this.composingBuffer.split('').map(c => ({ text: c })),
      candidates: this.candidates.map(c => ({ candidate: { value: c } })),
    };
    this.ui.update(JSON.stringify(state));
  }

  reset() {
    this.composingBuffer = '';
    this.candidates = [];
    this.ui.reset();
  }
}