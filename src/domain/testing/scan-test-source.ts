import type { ForbiddenUse, SourceFile } from '@/domain/testing/types';

type Rule = {
  rule: string;
  pattern: RegExp;
  matchesInsideStrings: boolean;
  fileSystem: boolean;
};

type ScanOptions = {
  allowFileSystem: boolean;
};

const FILE_SYSTEM_MODULES = String.raw`(?:node:)?(?:fs|fs/promises|child_process|worker_threads|module|vm|inspector)`;

const RULES: Rule[] = [
  { rule: 'imports a file-system or process module', pattern: new RegExp(String.raw`\bfrom\s+['"]${FILE_SYSTEM_MODULES}['"]`, 'u'), matchesInsideStrings: true, fileSystem: true },
  { rule: 'imports a file-system or process module', pattern: new RegExp(String.raw`\b(?:require|import)\s*\(\s*['"]${FILE_SYSTEM_MODULES}['"]`, 'u'), matchesInsideStrings: true, fileSystem: true },
  { rule: 'imports a file-system or process module', pattern: new RegExp(String.raw`^\s*import\s+['"]${FILE_SYSTEM_MODULES}['"]`, 'u'), matchesInsideStrings: true, fileSystem: true },
  { rule: 'reads files', pattern: /\b(?:readFileSync|readFile|readdirSync|readdir|createReadStream|openSync)\s*\(/u, matchesInsideStrings: false, fileSystem: true },
  { rule: 'imports a file as raw text or a URL', pattern: /(?:\bfrom\s+|\b(?:import|require)\s*\(\s*|^\s*import\s+)['"][^'"\n]+\?(?:raw|url|inline)['"]/u, matchesInsideStrings: true, fileSystem: false },
  { rule: 'uses import.meta.glob', pattern: /\bimport\.meta\.glob(?:Eager)?\s*\(/u, matchesInsideStrings: false, fileSystem: false },
  { rule: 'reaches Node internals', pattern: /\bprocess\s*\.\s*(?:binding|getBuiltinModule|dlopen)\b/u, matchesInsideStrings: false, fileSystem: true },
  { rule: 'creates a require function', pattern: /\bcreateRequire\s*\(/u, matchesInsideStrings: false, fileSystem: true },
  { rule: 'spawns processes', pattern: /\b(?:execSync|spawnSync|execFileSync)\s*\(|\bBun\s*\.\s*(?:file|spawn)\b|\bDeno\s*\.\s*(?:readTextFile|readFile|run)\b/u, matchesInsideStrings: false, fileSystem: true },
  { rule: 'prints function source', pattern: /\bFunction\s*\.\s*prototype\s*\.\s*toString\b/u, matchesInsideStrings: false, fileSystem: false },
];

export function scanTestSource(files: SourceFile[], options: ScanOptions): ForbiddenUse[] {
  const rules = RULES.filter((rule) => !(options.allowFileSystem && rule.fileSystem));
  return files.flatMap((file) => {
    const lines = file.content.split(/\r?\n/u);
    const importedNames = collectImportedNames(file.content);
    return lines.flatMap((line, index) => {
      const code = stripStringsAndComments(line);
      const ruleHits = rules.filter((rule) => rule.pattern.test(rule.matchesInsideStrings ? line : code)).map((rule) => rule.rule);
      const sourceHits = printsImportedSource(code, importedNames) ? ['prints the source of an imported function'] : [];
      return [...new Set([...ruleHits, ...sourceHits])].map((rule) => ({ path: file.path, line: index + 1, rule }));
    });
  });
}

function collectImportedNames(content: string): string[] {
  const names = new Set<string>();
  for (const match of content.matchAll(/\bimport\s+(?!type\b)([^'";]+?)\s+from\s+['"][^'"]+['"]/gu)) {
    const clause = match[1] ?? '';
    for (const name of clause.replace(/[{}*]/gu, ',').split(',')) {
      const local = name.trim().split(/(?:^|\s+)as\s+/u).at(-1)?.trim() ?? '';
      if (/^[A-Za-z_$][\w$]*$/u.test(local) && local !== 'type') {
        names.add(local);
      }
    }
  }
  return [...names];
}

function printsImportedSource(code: string, importedNames: string[]): boolean {
  return importedNames.some((name) => {
    const escaped = name.replace(/\$/gu, String.raw`\$`);
    return new RegExp(String.raw`(?<![\w$.])${escaped}\s*\.\s*toString\s*\(|\bString\s*\(\s*${escaped}\s*\)|\$\{\s*${escaped}\s*\}|[\u0022\u0027\u0060]\s*\+\s*${escaped}(?![\w$(.])`, 'u').test(code);
  });
}

function stripStringsAndComments(line: string): string {
  return line
    .replace(/\/\/.*$/u, '')
    .replace(/'(?:\\.|[^'\\])*'/gu, "''")
    .replace(/"(?:\\.|[^"\\])*"/gu, '""')
    .replace(/`(?:\\.|[^`\\$]|\$(?!\{))*`/gu, '``');
}
