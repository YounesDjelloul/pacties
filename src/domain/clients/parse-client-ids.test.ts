import { describe, expect, it } from 'vitest';
import { isClientId, parseClientIds } from '@/domain/clients/parse-client-ids';

describe('parseClientIds', () => {
  it('accepts a comma-separated list with spaces, mixed case and duplicates', () => {
    expect(parseClientIds(' Cursor ,claude-code,, CURSOR ')).toEqual({ ok: true, value: ['cursor', 'claude-code'] });
  });

  it('names every unsupported client and points to the manual route', () => {
    const result = parseClientIds('cursor,codex,windsurf');
    expect(result).toEqual({
      ok: false,
      error: 'pacties does not support "codex", "windsurf" yet; supported: claude-code, cursor. Run "pacties init --print" to register it by hand',
    });
  });

  it.each(['', ' , ,', '\t'])('refuses the empty selection %j', (raw) => {
    expect(parseClientIds(raw)).toEqual({ ok: false, error: 'Name at least one client: claude-code, cursor' });
  });
});

describe('isClientId', () => {
  it.each([['claude-code', true], ['cursor', true], ['Cursor', false], ['claude', false]])('%s -> %s', (value, expected) => {
    expect(isClientId(value)).toBe(expected);
  });
});
