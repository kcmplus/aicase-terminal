/**
 * 键盘样式配置接口
 * 用于自定义键盘各组件的颜色主题
 */
export interface KeyboardStyle {
  /** 键盘整体背景色 */
  keyboardBg?: string;
  /** 候选词栏背景色 */
  candidateBarBg?: string;
  /** 候选词栏导航按钮背景色 */
  candidateNavBg?: string;
  /** 候选词栏导航按钮禁用透明度 */
  candidateNavDisabledOpacity?: string;
  /** 候选词项背景色 */
  candidateItemBg?: string;
  /** 候选词项边框色 */
  candidateItemBorder?: string;
  /** 候选词项文字颜色 */
  candidateItemText?: string;
  /** 候选词序号颜色 */
  candidateIndexColor?: string;
  /** 拼写显示背景色 */
  compositionBg?: string;
  /** 拼写显示文字颜色 */
  compositionText?: string;
  /** 普通按键背景色 */
  keyBg?: string;
  /** 普通按键文字颜色 */
  keyText?: string;
  /** 普通按键按下背景色 */
  keyActiveBg?: string;
  /** 普通按键按下文字颜色 */
  keyActiveText?: string;
  /** 普通按键边框颜色 */
  keyBorder?: string;
  /** 删除键背景色 */
  bkspBg?: string;
  /** 删除键文字颜色 */
  bkspText?: string;
  /** 删除键边框颜色 */
  bkspBorder?: string;
  /** 删除键按下背景色 */
  bkspActiveBg?: string;
  /** 删除键按下文字颜色 */
  bkspActiveText?: string;
  /** 确认键背景色 */
  confirmBg?: string;
  /** 确认键文字颜色 */
  confirmText?: string;
  /** 确认键边框颜色 */
  confirmBorder?: string;
  /** 确认键按下背景色 */
  confirmActiveBg?: string;
  /** 确认键按下文字颜色 */
  confirmActiveText?: string;
  /** Shift/Caps键背景色 */
  shiftBg?: string;
  /** Shift/Caps键文字颜色 */
  shiftText?: string;
  /** Shift/Caps键边框颜色 */
  shiftBorder?: string;
  /** Shift/Caps键按下背景色 */
  shiftActiveBg?: string;
  /** Shift/Caps键按下文字颜色 */
  shiftActiveText?: string;
  /** Tab键背景色 */
  tabBg?: string;
  /** Tab键文字颜色 */
  tabText?: string;
  /** Tab键边框颜色 */
  tabBorder?: string;
  /** Tab键按下背景色 */
  tabActiveBg?: string;
  /** Tab键按下文字颜色 */
  tabActiveText?: string;
  /** Enter键背景色 */
  enterBg?: string;
  /** Enter键文字颜色 */
  enterText?: string;
  /** Enter键边框颜色 */
  enterBorder?: string;
  /** Enter键按下背景色 */
  enterActiveBg?: string;
  /** Enter键按下文字颜色 */
  enterActiveText?: string;
  /** 空格键背景色 */
  spaceBg?: string;
  /** 空格键边框颜色 */
  spaceBorder?: string;
  /** 空格键按下背景色 */
  spaceActiveBg?: string;
  /** 空格键文字颜色 */
  spaceText?: string;
  /** 空格键按下文字颜色 */
  spaceActiveText?: string;
}