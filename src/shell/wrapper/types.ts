export type WrapperTerminal = {
  columns: () => number;
  rows: () => number;
  write: (text: string) => void;
  onInput: (listener: (chunk: string) => void) => void;
  onResize: (listener: () => void) => void;
  start: () => void;
  stop: () => void;
};
