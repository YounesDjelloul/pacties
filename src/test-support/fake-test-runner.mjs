import fs from 'node:fs';
import path from 'node:path';

const [reportPath, mode] = process.argv.slice(2);

if (mode === 'crash') {
  process.stderr.write('SyntaxError: Unexpected token in src/__tests__/broken.test.ts\n');
  process.exit(2);
}

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function walk(dir, found) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, found);
    } else if (/\.test\.[jt]s$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

const suites = walk(process.cwd(), []).sort().map((file) => {
  const relative = path.relative(process.cwd(), file).split(path.sep).join('/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => /^\s*it\('/.test(line));
  const cases = lines.map((line) => {
    const name = /it\('([^']+)'/.exec(line)[1];
    const failure = /fails with "([^"]+)"/.exec(line)?.[1];
    const body = failure === undefined ? '' : `<failure message="${escape(failure)}">${escape(`${failure}\n    at run (${file}:1:1)`)}</failure>`;
    return `<testcase classname="${escape(relative)}" name="${escape(name)}">${body}</testcase>`;
  });
  return `<testsuite name="${escape(relative)}">${cases.join('')}</testsuite>`;
});

process.stdout.write(`ran ${suites.length} files\n`);
fs.writeFileSync(reportPath, `<?xml version="1.0" encoding="UTF-8" ?>\r\n<testsuites name="fake">${suites.join('\r\n')}</testsuites>`);
