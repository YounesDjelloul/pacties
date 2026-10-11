import { describe, expect, it } from 'vitest';
import { resolveRepoIdentity } from '@/domain/project/resolve-repo-identity';

const ROOT_A = '9f2c1e0b7d4a63c58e1f0a2b3c4d5e6f7a8b9c0d';
const ROOT_B = '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567';
const COMMON_DIR = '/Users/zoë/Code/Payments API/.git';

describe('resolveRepoIdentity', () => {
  it('creates a root-commit based id for a new repository', () => {
    const identity = resolveRepoIdentity({ commonDir: COMMON_DIR, rootCommits: [ROOT_A] }, {}, []);
    expect(identity).toMatchObject({
      indexKey: COMMON_DIR,
      name: 'Payments API',
      rootCommit: ROOT_A,
      resolution: 'new',
      rootCommitLearned: false,
    });
    expect(identity.repoId).toMatch(/^payments-api-[0-9a-f]{12}$/u);
  });

  it('derives the same id for the same root commit regardless of path', () => {
    const first = resolveRepoIdentity({ commonDir: '/tmp/a/.git', rootCommits: [ROOT_A] }, {}, []);
    const second = resolveRepoIdentity({ commonDir: '/srv/b/a/.git', rootCommits: [ROOT_A] }, {}, []);
    expect(first.repoId).toBe(second.repoId);
  });

  it('derives different ids for different root commits in folders with the same name', () => {
    const first = resolveRepoIdentity({ commonDir: '/tmp/x/api/.git', rootCommits: [ROOT_A] }, {}, []);
    const second = resolveRepoIdentity({ commonDir: '/tmp/y/api/.git', rootCommits: [ROOT_B] }, {}, []);
    expect(first.repoId).not.toBe(second.repoId);
  });

  it('falls back to a path-based id when the repository has no commits', () => {
    const first = resolveRepoIdentity({ commonDir: '/tmp/x/api/.git', rootCommits: [] }, {}, []);
    const second = resolveRepoIdentity({ commonDir: '/tmp/y/api/.git', rootCommits: [] }, {}, []);
    expect([first.rootCommit, first.resolution]).toEqual([null, 'new']);
    expect(first.repoId).not.toBe(second.repoId);
  });

  it('keeps the indexed id after the first commit appears and reports the learned root commit', () => {
    const before = resolveRepoIdentity({ commonDir: COMMON_DIR, rootCommits: [] }, {}, []);
    const after = resolveRepoIdentity(
      { commonDir: COMMON_DIR, rootCommits: [ROOT_A] },
      { [before.indexKey]: before.repoId },
      [{ repoId: before.repoId, rootCommit: null }],
    );
    expect(after).toMatchObject({ repoId: before.repoId, rootCommit: ROOT_A, resolution: 'indexed', rootCommitLearned: true });
  });

  it('keeps the recorded root commit of an indexed project', () => {
    const identity = resolveRepoIdentity(
      { commonDir: COMMON_DIR, rootCommits: [ROOT_B] },
      { [COMMON_DIR]: 'payments-api-111111111111' },
      [{ repoId: 'payments-api-111111111111', rootCommit: ROOT_A }],
    );
    expect([identity.repoId, identity.rootCommit, identity.rootCommitLearned]).toEqual(['payments-api-111111111111', ROOT_A, false]);
  });

  it('reuses an indexed id even when its project folder is gone', () => {
    const identity = resolveRepoIdentity({ commonDir: COMMON_DIR, rootCommits: [ROOT_A] }, { [COMMON_DIR]: 'payments-api-222222222222' }, []);
    expect(identity).toMatchObject({ repoId: 'payments-api-222222222222', resolution: 'indexed', rootCommit: ROOT_A, rootCommitLearned: false });
  });

  it('matches a clone at another path through its root commit', () => {
    const identity = resolveRepoIdentity(
      { commonDir: '/Volumes/Work Disk/payments-clone/.git', rootCommits: [ROOT_A] },
      { [COMMON_DIR]: 'payments-api-333333333333' },
      [{ repoId: 'other-444444444444', rootCommit: ROOT_B }, { repoId: 'payments-api-333333333333', rootCommit: ROOT_A }],
    );
    expect(identity).toMatchObject({ repoId: 'payments-api-333333333333', resolution: 'matched_clone', indexKey: '/Volumes/Work Disk/payments-clone/.git' });
  });

  it('does not match projects without a root commit to a repository without commits', () => {
    const identity = resolveRepoIdentity({ commonDir: '/tmp/fresh/.git', rootCommits: [] }, {}, [{ repoId: 'empty-555555555555', rootCommit: null }]);
    expect(identity.resolution).toBe('new');
  });

  it('chooses the same root commit whatever order git lists several roots in', () => {
    const first = resolveRepoIdentity({ commonDir: '/tmp/m/.git', rootCommits: [ROOT_A, ROOT_B] }, {}, []);
    const second = resolveRepoIdentity({ commonDir: '/tmp/m/.git', rootCommits: [`${ROOT_B}\n`, ROOT_A.toUpperCase()] }, {}, []);
    expect([first.rootCommit, second.rootCommit]).toEqual([ROOT_B, ROOT_B]);
    expect(first.repoId).toBe(second.repoId);
  });

  it('ignores blank root commit lines', () => {
    expect(resolveRepoIdentity({ commonDir: '/tmp/m/.git', rootCommits: ['', '  '] }, {}, []).rootCommit).toBeNull();
  });

  it('treats trailing slashes and redundant segments as the same index key', () => {
    const indexed = { '/Users/zoë/Code/Payments API/.git': 'payments-api-666666666666' };
    for (const commonDir of ['/Users/zoë/Code/Payments API/.git/', '/Users/zoë/Code/./Payments API//.git']) {
      expect(resolveRepoIdentity({ commonDir, rootCommits: [] }, indexed, []).repoId).toBe('payments-api-666666666666');
    }
  });

  it('treats NFD and NFC spellings of the same path as one repository', () => {
    const nfd = COMMON_DIR.normalize('NFD');
    expect(nfd).not.toBe(COMMON_DIR);
    const identity = resolveRepoIdentity({ commonDir: nfd, rootCommits: [] }, { [COMMON_DIR]: 'payments-api-777777777777' }, []);
    expect(identity.repoId).toBe('payments-api-777777777777');
  });

  it.each([
    ['/w/Zoë Ørsted Ñúñez/.git', /^zoe-rsted-nunez-[0-9a-f]{12}$/u],
    ['/w/日本語/.git', /^repo-[0-9a-f]{12}$/u],
    ['/w/--Payments__API--/.git', /^payments-api-[0-9a-f]{12}$/u],
    ['/srv/git/ledger.git', /^ledger-[0-9a-f]{12}$/u],
    [`/w/${'very-long-name-'.repeat(5)}/.git`, /^very-long-name-very-long-name-very-long-[0-9a-f]{12}$/u],
  ])('builds a filesystem-safe slug for %s', (commonDir, pattern) => {
    expect(resolveRepoIdentity({ commonDir, rootCommits: [ROOT_A] }, {}, []).repoId).toMatch(pattern);
  });

  it('derives the repository name from a bare repository folder', () => {
    expect(resolveRepoIdentity({ commonDir: '/srv/git/ledger.git', rootCommits: [] }, {}, []).name).toBe('ledger');
  });
});
