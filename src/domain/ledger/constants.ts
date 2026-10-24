export const FIRST_VERSION = 1;
export const ROLES = ['planner', 'tester'] as const;
export const BEHAVIOR_STATUSES = ['planned', 'approved', 'tested', 'passing', 'stale', 'rejected'] as const;
export const STATUSES_WITH_TESTS = ['tested', 'passing', 'stale'] as const;
export const RUN_STATUSES = ['completed', 'refused', 'blocked', 'crashed'] as const;
export const STOPPED_RUN_STATUSES = ['refused', 'blocked', 'crashed'] as const;
