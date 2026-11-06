export declare class InputController {
  constructor(ui: {
    reset(): void;
    commitString(text: string): void;
    update(stateJSON: string): void;
  });

  setKeyboardLayout(layout: string): void;
  setLanguageCode(code: string): void;
  setCandidateKeysCount(count: number): void;
  simpleKeyboardEvent(key: string, shift: boolean, alt: boolean): void;
  selectCandidateAtIndex(index: number): void;
  reset(): void;
}