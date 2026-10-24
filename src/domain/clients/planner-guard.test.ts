import { describe, expect, it } from 'vitest';
import { addExcludeLine, addPlannerGuard, buildPlannerGuardRules, removePlannerGuard } from '@/domain/clients/planner-guard';
import { DEFAULT_TEST_GLOBS } from '@/domain/testing/test-policy';

const rules = buildPlannerGuardRules(DEFAULT_TEST_GLOBS);

describe('buildPlannerGuardRules', () => {
  it('turns every test glob into an Edit deny rule, which also covers Write', () => {
    expect(rules).toEqual([
      'Edit(**/*.test.*)',
      'Edit(**/*.spec.*)',
      'Edit(**/__tests__/**)',
      'Edit(**/__snapshots__/**)',
      'Edit(**/test-support/**)',
      'Edit(e2e/**)',
    ]);
  });

  it('dedupes repeated globs', () => {
    expect(buildPlannerGuardRules(['**/*.test.*', '**/*.test.*'])).toEqual(['Edit(**/*.test.*)']);
  });
});

describe('addPlannerGuard', () => {
  it('creates the settings from nothing', () => {
    expect(addPlannerGuard(null, rules)).toEqual({ ok: true, value: { permissions: { deny: rules } } });
  });

  it("keeps the user's own settings and rules, and does not duplicate rules already there", () => {
    const existing = {
      model: 'opus',
      permissions: { allow: ['Bash(npm run test:*)'], deny: ['Read(./.env)', 'Edit(**/*.test.*)'], defaultMode: 'acceptEdits' },
      hooks: { Stop: [] },
    };
    const merged = addPlannerGuard(existing, rules);
    expect(merged).toEqual({
      ok: true,
      value: {
        model: 'opus',
        permissions: { allow: ['Bash(npm run test:*)'], deny: ['Read(./.env)', ...rules], defaultMode: 'acceptEdits' },
        hooks: { Stop: [] },
      },
    });
  });

  it.each([
    ['a list', ['x'], 'must contain a JSON object'],
    ['a string', 'deny', 'must contain a JSON object'],
    ['non-object permissions', { permissions: ['deny'] }, '"permissions" in .claude/settings.local.json must be a JSON object'],
    ['a non-list deny', { permissions: { deny: 'Edit(**)' } }, '"permissions.deny" in .claude/settings.local.json must be a list of rules'],
    ['a deny list with a non-string', { permissions: { deny: ['Edit(x)', 3] } }, 'must be a list of rules'],
  ])('refuses %s', (_, existing, message) => {
    const result = addPlannerGuard(existing, rules);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toContain(message);
  });
});

describe('removePlannerGuard', () => {
  it("removes only pacties' rules and keeps everything else, including an emptied deny list", () => {
    const existing = { permissions: { deny: ['Read(./.env)', ...rules], allow: ['WebFetch'] }, env: { CI: '1' } };
    expect(removePlannerGuard(existing, rules)).toEqual({ ok: true, value: { permissions: { deny: ['Read(./.env)'], allow: ['WebFetch'] }, env: { CI: '1' } } });
    expect(removePlannerGuard({ permissions: { deny: rules } }, rules)).toEqual({ ok: true, value: { permissions: { deny: [] } } });
  });

  it('accepts missing settings', () => {
    expect(removePlannerGuard(undefined, rules)).toEqual({ ok: true, value: { permissions: { deny: [] } } });
  });
});

describe('addExcludeLine', () => {
  it('appends to an empty file, a file ending with a newline, and one without', () => {
    expect(addExcludeLine('', '.claude/settings.local.json')).toBe('.claude/settings.local.json\n');
    expect(addExcludeLine('# git ls-files --others\r\n*.log\r\n', '.claude/settings.local.json')).toBe('# git ls-files --others\r\n*.log\r\n.claude/settings.local.json\n');
    expect(addExcludeLine('*.log', '.claude/settings.local.json')).toBe('*.log\n.claude/settings.local.json\n');
  });

  it.each(['.claude/settings.local.json\n', '  .claude/settings.local.json  \r\n', '/.claude/settings.local.json'])('leaves %j alone because the line is already there', (content) => {
    expect(addExcludeLine(content, '.claude/settings.local.json')).toBeNull();
  });
});
