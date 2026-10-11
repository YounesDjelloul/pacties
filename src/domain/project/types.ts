export type GitFacts = {
  commonDir: string;
  rootCommits: string[];
};

export type RepoIndex = Record<string, string>;

export type KnownProject = {
  repoId: string;
  rootCommit: string | null;
};

export type RepoIdentity = {
  repoId: string;
  indexKey: string;
  name: string;
  rootCommit: string | null;
  resolution: 'indexed' | 'matched_clone' | 'new';
  rootCommitLearned: boolean;
};
