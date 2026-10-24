import { describe, expect, it } from 'vitest';
import { buildReview } from '@/domain/ledger/review';
import { PLANNER_NUDGE, initialWrapperState, latestPlannerNewsSeq, reduceWrapper } from '@/domain/wrapper/wrapper-state';
import { approve, ledgerOf, propose, proposeMany, recordResults, reportIssue, submitTests } from '@/test-support/ledger-script';
import { transferOverDailyLimit } from '@/test-support/behavior-fixtures';
import type { LedgerEvent, Review } from '@/domain/ledger/types';
import type { WrapperEffect, WrapperEvent, WrapperState } from '@/domain/wrapper/types';

function load(events: LedgerEvent[]): WrapperEvent {
  const ledger = ledgerOf(events);
  const reviews = ledger.behaviors.map(buildReview).filter((review): review is Review => review !== null);
  return { kind: 'ledger_loaded', ledger, reviews, newsSeq: latestPlannerNewsSeq(events) };
}

function run(events: WrapperEvent[], start: WrapperState = initialWrapperState('planner-a')): { state: WrapperState; effects: WrapperEffect[] } {
  return events.reduce<{ state: WrapperState; effects: WrapperEffect[] }>(
    (acc, event) => {
      const next = reduceWrapper(acc.state, event);
      return { state: next.state, effects: [...acc.effects, ...next.effects] };
    },
    { state: start, effects: [] },
  );
}

const typed = (text: string): WrapperEvent => ({ kind: 'input', segment: { kind: 'bytes', text } });
const toggle: WrapperEvent = { kind: 'input', segment: { kind: 'toggle_screen' } };
const nonRender = (effects: WrapperEffect[]) => effects.filter((effect) => effect.kind !== 'render');

function tenWithTwoApproved(): LedgerEvent[] {
  return approve(propose(proposeMany([], 9), transferOverDailyLimit), 'B10', 'B2');
}

describe('reduceWrapper: tester jobs', () => {
  it('starts one job for every approved behavior that needs tests on the first load', () => {
    const { effects, state } = run([load(tenWithTwoApproved())]);
    expect(nonRender(effects)).toEqual([{ kind: 'start_job', requests: [{ id: 'B2', version: 1 }, { id: 'B10', version: 1 }], sessionId: null }]);
    expect(state.job.dispatched).toEqual(['B2@v1', 'B10@v1']);
  });

  it('batches approvals that land while a job runs into one follow-up job that resumes the paired tester session', () => {
    const first = tenWithTwoApproved();
    const later = approve(first, 'B3', 'B9');
    const { effects } = run([
      load(first),
      { kind: 'job_event', event: { kind: 'session', sessionId: 'tester-1' } },
      load(approve(first, 'B3')),
      load(later),
      { kind: 'job_finished', failure: null },
    ]);
    expect(nonRender(effects).filter((effect) => effect.kind === 'start_job')).toEqual([
      { kind: 'start_job', requests: [{ id: 'B2', version: 1 }, { id: 'B10', version: 1 }], sessionId: null },
      { kind: 'start_job', requests: [{ id: 'B2', version: 1 }, { id: 'B3', version: 1 }, { id: 'B9', version: 1 }, { id: 'B10', version: 1 }], sessionId: 'tester-1' },
    ]);
  });

  it('does not loop on the same work when a job ends without submitting tests', () => {
    const events = tenWithTwoApproved();
    const { effects } = run([load(events), { kind: 'job_finished', failure: 'claude exited with code 1' }, load(events)]);
    expect(nonRender(effects).filter((effect) => effect.kind === 'start_job')).toHaveLength(1);
  });

  it('logs job output, pairs the newest tester session with the planner session, and logs a failure', () => {
    const { state, effects } = run([
      load(tenWithTwoApproved()),
      { kind: 'job_event', event: { kind: 'session', sessionId: 's-1' } },
      { kind: 'job_event', event: { kind: 'log', entry: { kind: 'tool', text: 'Write a.test.ts' } } },
      { kind: 'job_event', event: { kind: 'result', sessionId: 's-2', entry: { kind: 'result', text: 'Covered B2.' } } },
      { kind: 'job_finished', failure: 'exit 1' },
    ]);
    expect(state.job.pairs).toEqual({ 'planner-a': 's-2' });
    expect(nonRender(effects).filter((effect) => effect.kind === 'save_pairs')).toEqual([
      { kind: 'save_pairs', pairs: { 'planner-a': 's-1' } },
      { kind: 'save_pairs', pairs: { 'planner-a': 's-2' } },
    ]);
    expect(state.job.running).toBeNull();
    expect(state.job.log.map((entry) => entry.text)).toEqual(['Tester job started for B2 v1, B10 v1', 'Write a.test.ts', 'Covered B2.', 'exit 1']);
  });
});

describe('reduceWrapper: session pairing', () => {
  it('holds tester jobs until it knows the planner session, then starts a fresh tester for an unpaired one', () => {
    const waiting = run([load(tenWithTwoApproved())], initialWrapperState(null, { 'older-planner': 'older-tester' }));
    expect(nonRender(waiting.effects)).toEqual([]);
    const { effects } = run([{ kind: 'planner_session', sessionId: 'resumed-without-tester' }], waiting.state);
    expect(nonRender(effects)).toEqual([{ kind: 'start_job', requests: [{ id: 'B2', version: 1 }, { id: 'B10', version: 1 }], sessionId: null }]);
  });

  it('resumes the tester session paired with a resumed planner session', () => {
    const { effects } = run([load(tenWithTwoApproved())], initialWrapperState('planner-é', { 'planner-é': 'tester-é', other: 'tester-x' }));
    expect(nonRender(effects)).toEqual([{ kind: 'start_job', requests: [{ id: 'B2', version: 1 }, { id: 'B10', version: 1 }], sessionId: 'tester-é' }]);
  });

  it('keeps pairing a running job with the planner session it started under, even after /resume switches sessions', () => {
    const { state } = run([
      load(tenWithTwoApproved()),
      { kind: 'planner_session', sessionId: 'planner-b' },
      { kind: 'job_event', event: { kind: 'session', sessionId: 'tester-for-a' } },
      { kind: 'job_finished', failure: null },
    ]);
    expect(state.job.pairs).toEqual({ 'planner-a': 'tester-for-a' });
    expect(state.planner.sessionId).toBe('planner-b');
  });

  it('ignores a report of the planner session it already knows', () => {
    const start = run([load(tenWithTwoApproved())]).state;
    expect(run([{ kind: 'planner_session', sessionId: 'planner-a' }], start).effects).toEqual([]);
  });
});

describe('reduceWrapper: planner nudges', () => {
  function withNews(): LedgerEvent[] {
    let events = submitTests(tenWithTwoApproved(), 'B2', 'B10');
    events = recordResults(events, 'run-1', [{ id: 'B2', passed: 1, failed: 1 }]);
    return reportIssue(events, 'B10', 'remaining has no type');
  }

  const settled = (events: LedgerEvent[]) => run([load(events), { kind: 'job_finished', failure: null }]).state;

  it('ignores news that existed before the wrapper started', () => {
    const { effects } = run([{ kind: 'planner_idle' }], settled(withNews()));
    expect(nonRender(effects)).toEqual([]);
  });

  it('types one nudge for several new results once the planner is idle and the tester is done', () => {
    const start = settled(tenWithTwoApproved());
    const { effects } = run([load(withNews()), { kind: 'planner_idle' }, { kind: 'planner_idle' }], start);
    expect(nonRender(effects).filter((effect) => effect.kind === 'nudge_planner')).toEqual([{ kind: 'nudge_planner', text: PLANNER_NUDGE }]);
  });

  it('waits while the planner is busy and nudges when it turns idle', () => {
    const start = settled(tenWithTwoApproved());
    const busy = run([{ kind: 'planner_busy' }, load(withNews())], start);
    expect(nonRender(busy.effects)).toEqual([]);
    expect(nonRender(run([{ kind: 'planner_idle' }], busy.state).effects)).toEqual([{ kind: 'nudge_planner', text: PLANNER_NUDGE }]);
  });

  it('never nudges over a message you started typing', () => {
    const start = settled(tenWithTwoApproved());
    const { effects } = run([{ kind: 'planner_idle' }, typed('also check B4'), load(withNews())], start);
    expect(nonRender(effects)).toEqual([{ kind: 'write_planner', text: 'also check B4' }]);
  });

  it('holds the nudge while a tester job is still running', () => {
    const start = run([load(tenWithTwoApproved())]).state;
    const { effects } = run([{ kind: 'planner_idle' }, load(withNews())], start);
    expect(nonRender(effects).filter((effect) => effect.kind === 'nudge_planner')).toEqual([]);
  });
});

describe('reduceWrapper: screens and keys', () => {
  function withReviews(): WrapperState {
    const events = revisedPending();
    return run([load(events), { kind: 'job_finished', failure: null }, toggle]).state;
  }

  function revisedPending(): LedgerEvent[] {
    return propose(propose(proposeMany([], 9), transferOverDailyLimit), { description: 'payee "Zoë" keeps accents', contract: { interface: ['PUT /payees/:id'] } });
  }

  it('switches screens with Ctrl-\\ and sends planner keystrokes straight through', () => {
    const { state, effects } = run([typed('hi\u001b[A'), toggle]);
    expect(state.screen).toBe('pacties');
    expect(nonRender(effects)).toEqual([{ kind: 'write_planner', text: 'hi\u001b[A' }]);
  });

  it('never forwards pacties-screen keys to the planner', () => {
    const { effects } = run([typed('hello y\r')], withReviews());
    expect(nonRender(effects).some((effect) => effect.kind === 'write_planner')).toBe(false);
  });

  it('approves only the ticked reviews at the versions shown', () => {
    const { effects, state } = run([typed('jjjjjjjjjj\u001b[A a')], withReviews());
    const approvals = nonRender(effects).filter((effect) => effect.kind === 'approve');
    expect(approvals).toHaveLength(1);
    const approved = approvals[0]!.kind === 'approve' ? approvals[0]!.requests.map((request) => request.id) : [];
    expect(approved).not.toContain('B10');
    expect(approved).toHaveLength(10);
    expect(state.message).toMatch(/^Approved B1 v1, /u);
  });

  it('refuses to approve when nothing is ticked', () => {
    const start = withReviews();
    const untickAll = start.reviews.map(() => ' j').join('');
    const { effects, state } = run([typed(`${untickAll}\r`)], start);
    expect(nonRender(effects)).toEqual([]);
    expect(state.message).toBe('Nothing ticked, so nothing was approved.');
  });

  it('collects a rejection reason with editing, and needs a non-blank one', () => {
    const start = withReviews();
    const blank = run([typed('r  \r')], start);
    expect(blank.state.message).toBe('Type a reason so the planner knows why.');
    const { effects } = run([typed('r out of scopx\u007fe\r')], start);
    expect(nonRender(effects)).toEqual([{ kind: 'reject', id: 'B1', reason: 'out of scope' }]);
  });

  it('cancels a rejection with Escape', () => {
    const { state, effects } = run([typed('rnope'), typed('\u001b')], withReviews());
    expect(state.rejecting).toBeNull();
    expect(nonRender(effects)).toEqual([]);
  });

  it('asks twice before quitting, and any other key resets the question', () => {
    expect(nonRender(run([typed('q')], withReviews()).effects)).toEqual([]);
    expect(nonRender(run([typed('qjq')], withReviews()).effects)).toEqual([]);
    expect(nonRender(run([typed('qq')], withReviews()).effects)).toEqual([{ kind: 'quit' }]);
  });

  it('keeps the cursor and ticks valid when reviews disappear', () => {
    const start = run([typed('jjjjjjjjjj ')], withReviews()).state;
    const { state } = run([load(approve(revisedPending(), 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11'))], start);
    expect([state.cursor, state.unticked, state.reviews]).toEqual([0, [], []]);
  });
});

describe('latestPlannerNewsSeq', () => {
  it('is the seq of the latest result, contract issue or stopped run', () => {
    let events = submitTests(tenWithTwoApproved(), 'B2');
    expect(latestPlannerNewsSeq(events)).toBe(0);
    events = recordResults(events, 'run-1', [{ id: 'B2', passed: 1, failed: 0 }]);
    expect(latestPlannerNewsSeq(events)).toBe(events.at(-1)!.seq);
  });
});
