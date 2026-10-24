import { describe, expect, it } from 'vitest';
import { scanTestSource } from '@/domain/testing/scan-test-source';

const scan = (content: string, allowFileSystem = false) =>
  scanTestSource([{ path: 'src/__tests__/limit.test.ts', content }], { allowFileSystem }).map((use) => [use.line, use.rule]);

describe('scanTestSource', () => {
  it.each([
    ["import { readFileSync } from 'node:fs';", 'imports a file-system or process module'],
    ['import fs from "fs/promises";', 'imports a file-system or process module'],
    ["const cp = require('child_process');", 'imports a file-system or process module'],
    ["const vm = await import('node:vm');", 'imports a file-system or process module'],
    ["import 'node:module';", 'imports a file-system or process module'],
    ["const text = await readFile(path, 'utf8');", 'reads files'],
    ["import source from '../daily-limit.ts?raw';", 'imports a file as raw text or a URL'],
    ["const all = import.meta.glob('../**/*.ts', { eager: true });", 'uses import.meta.glob'],
    ["const fs = process.getBuiltinModule('fs');", 'reaches Node internals'],
    ['const req = createRequire(import.meta.url);', 'creates a require function'],
    ["execSync('cat src/x.ts');", 'spawns processes'],
    ['const text = Function.prototype.toString.call(checkDailyLimit);', 'prints function source'],
  ])('flags %s', (line, rule) => {
    expect(scan(`import { it } from 'vitest';\r\n${line}`)).toContainEqual([2, rule]);
  });

  it.each([
    "import { checkDailyLimit } from '@/features/transfer/domain/daily-limit';\nexpect(checkDailyLimit.toString()).toBe('');",
    "import { checkDailyLimit as limit } from '../daily-limit';\nconsole.log(String(limit));",
    "import * as limits from '../daily-limit';\nthrow new Error(`${limits}`);",
    "import checkDailyLimit from '../daily-limit';\nexpect('' + checkDailyLimit).toBe('x');",
  ])('flags printing the source of an imported function: %s', (content) => {
    expect(scan(content)).toContainEqual([2, 'prints the source of an imported function']);
  });

  it.each([
    "it('[B10] reads fs-like limits from the readFile( config', () => {});",
    "it(\"[B4] rejects a 'node:fs' path in the payee name\", () => {});",
    '// readFileSync is never used here',
    'const result = checkDailyLimit(totals, amount).toString === undefined;',
    "import type { DailyTotals } from '../types';\nconst label = `${amount.toString()}`;",
    "expect(screen.getByText('logo.svg?url')).toBeVisible();",
    'const total = amount.toString();',
  ])('does not flag harmless code: %s', (content) => {
    expect(scan(content)).toEqual([]);
  });

  it('reports each file and line separately', () => {
    const uses = scanTestSource(
      [
        { path: 'a.test.ts', content: "import fs from 'fs';" },
        { path: 'e2e/b é.spec.ts', content: "\n\nexecSync('ls')" },
      ],
      { allowFileSystem: false },
    );
    expect(uses).toEqual([
      { path: 'a.test.ts', line: 1, rule: 'imports a file-system or process module' },
      { path: 'e2e/b é.spec.ts', line: 3, rule: 'spawns processes' },
    ]);
  });

  it('allows file-system and process use when the policy allows it, but still flags raw imports, globs and printed source', () => {
    const content = [
      "import fs from 'node:fs/promises';",
      "await fs.readFile(path.join(home, 'events.jsonl'), 'utf8');",
      "import source from '../fold-ledger.ts?raw';",
      "import { foldLedger } from '@/domain/ledger/fold-ledger';",
      'console.log(String(foldLedger));',
    ].join('\n');
    expect(scan(content, true)).toEqual([
      [3, 'imports a file as raw text or a URL'],
      [5, 'prints the source of an imported function'],
    ]);
  });
});
