export function wrapText(text: string, width: number): string[] {
  const room = Math.max(1, width);
  const lines = text.replace(/\t/gu, '  ').split(/\r\n|\r|\n/u).map((line) => line.trimEnd());
  const first = lines.findIndex((line) => line.length > 0);
  if (first === -1) {
    return [];
  }
  const last = lines.findLastIndex((line) => line.length > 0);
  return lines.slice(first, last + 1).flatMap((line) => wrapLine(line, room));
}

function wrapLine(line: string, width: number): string[] {
  if (line.length === 0) {
    return [''];
  }
  const indent = Array.from(/^ */u.exec(line)![0]).slice(0, width - 1).join('');
  const rows: string[] = [];
  let current = indent;
  let gap = '';
  for (const [, word = '', following = ''] of line.trim().matchAll(/(\S+)( *)/gu)) {
    const separator = current.length === indent.length ? '' : gap;
    gap = following;
    if (lengthOf(current) + separator.length + lengthOf(word) <= width) {
      current += separator + word;
      continue;
    }
    if (current.length > indent.length) {
      rows.push(current);
      current = indent;
    }
    let chars = Array.from(word);
    while (lengthOf(current) + chars.length > width) {
      const room = width - lengthOf(current);
      rows.push(current + chars.slice(0, room).join(''));
      chars = chars.slice(room);
      current = indent;
    }
    current += chars.join('');
  }
  rows.push(current);
  return rows;
}

function lengthOf(text: string): number {
  return Array.from(text).length;
}
