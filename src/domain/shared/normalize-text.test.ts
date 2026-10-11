import { describe, expect, it } from 'vitest';
import { collapseWhitespace } from '@/domain/shared/normalize-text';

describe('collapseWhitespace', () => {
  it('collapses CRLF, tabs and repeated spaces into single spaces', () => {
    expect(collapseWhitespace('POST  /transfer\t{ from_id,\r\n  to_id }')).toBe('POST /transfer { from_id, to_id }');
  });

  it('trims leading and trailing whitespace including newlines', () => {
    expect(collapseWhitespace('\r\n\t  -> 429 { remaining }  \n')).toBe('-> 429 { remaining }');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(collapseWhitespace(' \r\n\t  ')).toBe('');
  });

  it('treats non-breaking and ideographic spaces as whitespace', () => {
    expect(collapseWhitespace('get_daily_total(user_id) ->　int')).toBe('get_daily_total(user_id) -> int');
  });

  it('keeps non-ASCII characters intact', () => {
    expect(collapseWhitespace('  virement refusé   au-delà du plafond ')).toBe('virement refusé au-delà du plafond');
  });

  it('leaves already-normalized text unchanged', () => {
    expect(collapseWhitespace('B10 depends on B2')).toBe('B10 depends on B2');
  });
});
