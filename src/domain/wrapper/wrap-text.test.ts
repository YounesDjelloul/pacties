import { describe, expect, it } from 'vitest';
import { wrapText } from '@/domain/wrapper/wrap-text';

describe('wrapText', () => {
  it('breaks at spaces so every row fits and no word is lost', () => {
    expect(wrapText('get_delta fails: pacties needs a git repository for Zoë', 20)).toEqual(['get_delta fails:', 'pacties needs a git', 'repository for Zoë']);
  });

  it('keeps runs of spaces inside a row but drops them at a break', () => {
    expect(wrapText('B10 v1  new       transfer over limit', 26)).toEqual(['B10 v1  new       transfer', 'over limit']);
  });

  it('splits a word longer than a row, counting unicode characters once', () => {
    expect(wrapText('see src/zahlung-é/__tests__/limit.test.ts now', 12)).toEqual(['see', 'src/zahlung-', 'é/__tests__/', 'limit.test.t', 's now']);
  });

  it('keeps every line of a message, whatever the line endings, and one blank line between paragraphs', () => {
    expect(wrapText('\r\n\n  First:\r\n- B2 passes\rtrailing   \n\n- B10 fails\t\n \n', 40)).toEqual(['  First:', '- B2 passes', 'trailing', '', '- B10 fails']);
  });

  it('keeps indentation on wrapped rows of an indented line', () => {
    expect(wrapText('  - B9 needs get_daily_total(user_id)', 16)).toEqual(['  - B9 needs', '  get_daily_tota', '  l(user_id)']);
  });

  it('expands tabs to spaces', () => {
    expect(wrapText('\tamount: Decimal', 40)).toEqual(['  amount: Decimal']);
  });

  it('never loops or overflows when the indentation is wider than the row', () => {
    expect(wrapText('      abc', 3)).toEqual(['  a', '  b', '  c']);
  });

  it('falls back to one character per row for a width below one', () => {
    expect(wrapText('ab c', 0)).toEqual(['a', 'b', 'c']);
    expect(wrapText('ab', -4)).toEqual(['a', 'b']);
  });

  it('returns no rows for empty or blank text', () => {
    expect(wrapText('', 10)).toEqual([]);
    expect(wrapText(' \r\n\t \n', 10)).toEqual([]);
  });

  it('keeps a row that fits exactly on one row', () => {
    expect(wrapText('exactly 12ch', 12)).toEqual(['exactly 12ch']);
  });
});
