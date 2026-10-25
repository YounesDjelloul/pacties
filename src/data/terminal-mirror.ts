import serializeAddon from '@xterm/addon-serialize';
import xtermHeadless from '@xterm/headless';

const { SerializeAddon } = serializeAddon;
const { Terminal } = xtermHeadless;

export type TerminalMirror = {
  write: (data: string) => void;
  resize: (columns: number, rows: number) => void;
  snapshot: () => Promise<string>;
  dispose: () => void;
};

const ENTER_ALTERNATE_SCREEN = '\u001b[?1049h';

function activeScreen(serialized: string): string {
  const start = serialized.indexOf(ENTER_ALTERNATE_SCREEN);
  return start === -1 ? serialized : serialized.slice(start + ENTER_ALTERNATE_SCREEN.length);
}

export function createTerminalMirror(columns: number, rows: number): TerminalMirror {
  const terminal = new Terminal({ cols: Math.max(1, columns), rows: Math.max(1, rows), allowProposedApi: true, scrollback: 0 });
  const serializer = new SerializeAddon();
  terminal.loadAddon(serializer);
  return {
    write: (data) => terminal.write(data),
    resize: (nextColumns, nextRows) => terminal.resize(Math.max(1, nextColumns), Math.max(1, nextRows)),
    snapshot: () => new Promise((resolve) => terminal.write('', () => resolve(activeScreen(serializer.serialize({ scrollback: 0, excludeModes: true }))))),
    dispose: () => terminal.dispose(),
  };
}
