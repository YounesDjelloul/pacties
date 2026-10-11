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

export type Project = {
  repoId: string;
  name: string;
  dir: string;
  rootCommit: string | null;
};

export type ProjectRecord = {
  repoId: string;
  name: string;
  rootCommit: string | null;
  createdAt: string;
};
