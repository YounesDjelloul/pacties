import fs from 'node:fs';

const POLL_INTERVAL_MS = 200;

export function watchFileChanges(filePath: string, onChange: () => void): () => void {
  const listener = (current: fs.Stats, previous: fs.Stats) => {
    if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) {
      onChange();
    }
  };
  fs.watchFile(filePath, { interval: POLL_INTERVAL_MS, persistent: false }, listener);
  return () => fs.unwatchFile(filePath, listener);
}
