import { describe, expect, it } from 'vitest';
import { contentsEqual, normalizeContent, normalizeReason } from '@/domain/ledger/content';
import { transferOverDailyLimit } from '@/test-support/behavior-fixtures';

describe('normalizeContent', () => {
  it('collapses whitespace in the description and every contract line', () => {
    const result = normalizeContent(transferOverDailyLimit.description, transferOverDailyLimit.contract);
    expect(result).toEqual({
      ok: true,
      value: {
        description: 'transfer over daily limit returns 429',
        contract: {
          interface: ['POST /transfer { from_id, to_id, amount }', '-> 429 { error: "DAILY_LIMIT_EXCEEDED", remaining }'],
          dependsOn: ['get_daily_total(user_id) -> int'],
        },
      },
    });
  });

  it('drops blank contract lines and keeps the first occurrence order of duplicates', () => {
    const result = normalizeContent('ledger export streams CSV', {
      interface: ['  ', 'GET /exports/:id.csv -> 200 text/csv', '\r\n', 'GET  /exports/:id.csv -> 200 text/csv', '-> 404 when id unknown'],
      dependsOn: ['b()', 'a()', 'b()'],
    });
    expect(result.ok && result.value.contract).toEqual({
      interface: ['GET /exports/:id.csv -> 200 text/csv', '-> 404 when id unknown'],
      dependsOn: ['b()', 'a()'],
    });
  });

  it('defaults a missing dependsOn to an empty list', () => {
    const result = normalizeContent('ping answers pong', { interface: ['GET /ping -> 200 "pong"'] });
    expect(result.ok && result.value.contract.dependsOn).toEqual([]);
  });

  it.each(['', '   ', '\r\n\t', ' '])('rejects the description %j', (description) => {
    expect(normalizeContent(description, { interface: ['GET /ping -> 200'] })).toEqual({
      ok: false,
      error: 'Behavior description must not be empty',
    });
  });

  it.each([[[]], [['']], [['  ', '\r\n', '\t']]])('rejects the interface %j', (lines) => {
    const result = normalizeContent('ping answers pong', { interface: lines });
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toContain('Contract interface must contain at least one non-empty line');
  });

  it('keeps non-ASCII contract text intact', () => {
    const result = normalizeContent('Überweisung über Limit', { interface: ['überweise(betrag: Dezimal) -> Fehler'] });
    expect(result.ok && result.value.contract.interface).toEqual(['überweise(betrag: Dezimal) -> Fehler']);
  });
});

describe('normalizeReason', () => {
  it('collapses whitespace', () => {
    expect(normalizeReason('  limit is per\r\ncalendar day, not rolling 24h ')).toEqual({
      ok: true,
      value: 'limit is per calendar day, not rolling 24h',
    });
  });

  it.each(['', ' \t\r\n '])('rejects %j', (reason) => {
    expect(normalizeReason(reason).ok).toBe(false);
  });
});

describe('contentsEqual', () => {
  const content = {
    description: 'transfer over daily limit returns 429',
    contract: { interface: ['POST /transfer', '-> 429'], dependsOn: ['get_daily_total(user_id) -> int'] },
  };

  it('is true for structurally identical content', () => {
    expect(contentsEqual(content, structuredClone(content))).toBe(true);
  });

  it('is false when only the description differs', () => {
    expect(contentsEqual(content, { ...content, description: 'transfer over daily limit returns 409' })).toBe(false);
  });

  it('is false when interface lines are reordered', () => {
    expect(
      contentsEqual(content, { ...content, contract: { ...content.contract, interface: ['-> 429', 'POST /transfer'] } }),
    ).toBe(false);
  });

  it('is false when a dependency is added', () => {
    expect(
      contentsEqual(content, {
        ...content,
        contract: { ...content.contract, dependsOn: [...content.contract.dependsOn, 'now() -> Instant'] },
      }),
    ).toBe(false);
  });

  it('is false when the interface is a prefix of the other', () => {
    expect(contentsEqual(content, { ...content, contract: { ...content.contract, interface: ['POST /transfer'] } })).toBe(false);
  });
});
