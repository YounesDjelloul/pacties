import { readNextPanelKey } from '@/domain/wrapper/keys';
import { logEntryRows, logViewport } from '@/domain/wrapper/render-panel';
import { pendingTestWork, workKey } from '@/domain/wrapper/tester-job';
import type { LedgerEvent } from '@/domain/ledger/types';
import type { JobLogEntry, PanelKey, SessionPairs, Transition, WrapperEffect, WrapperEvent, WrapperState } from '@/domain/wrapper/types';

export const PLANNER_NUDGE = 'pacties: new test results or tester notes are in; call get_delta and act on them.';

const MAX_LOG_ENTRIES = 500;

export function initialWrapperState(plannerSessionId: string | null = null, pairs: SessionPairs = {}): WrapperState {
  return {
    screen: 'planner',
    panelSize: { width: 80, height: 23 },
    logScroll: 0,
    ledger: null,
    reviews: [],
    cursor: 0,
    unticked: [],
    rejecting: null,
    confirmQuit: false,
    message: null,
    job: { running: null, dispatched: [], pairs, log: [] },
    planner: { sessionId: plannerSessionId, idle: false, typedSinceIdle: false, newsSeq: 0, nudgedSeq: 0 },
  };
}

export function latestPlannerNewsSeq(events: LedgerEvent[]): number {
  const news = events.filter(
    (event) =>
      event.type === 'test_results_recorded' || event.type === 'contract_issue_reported' || (event.type === 'test_run_finished' && event.status !== 'completed'),
  );
  return news.at(-1)?.seq ?? 0;
}

export function reduceWrapper(state: WrapperState, event: WrapperEvent): Transition {
  switch (event.kind) {
    case 'ledger_loaded':
      return settle(onLedgerLoaded(state, event), [{ kind: 'render' }]);
    case 'input':
      if (event.segment.kind === 'toggle_screen') {
        return { state: { ...state, screen: state.screen === 'planner' ? 'pacties' : 'planner', confirmQuit: false }, effects: [{ kind: 'render' }] };
      }
      return state.screen === 'planner' ? typeIntoPlanner(state, event.segment.text) : onPanelInput(state, event.segment.text);
    case 'panel_resized':
      return { state: clampLogScroll({ ...state, panelSize: event.size }), effects: [{ kind: 'render' }] };
    case 'planner_idle':
      return settle({ ...state, planner: { ...state.planner, idle: true, typedSinceIdle: false } }, [{ kind: 'render' }]);
    case 'planner_busy':
      return { state: { ...state, planner: { ...state.planner, idle: false } }, effects: [] };
    case 'planner_session':
      if (state.planner.sessionId === event.sessionId) {
        return { state, effects: [] };
      }
      return settle({ ...state, planner: { ...state.planner, sessionId: event.sessionId } }, [{ kind: 'render' }]);
    case 'job_event':
      return onJobEvent(state, event.event);
    case 'job_finished': {
      const finished = { ...state, job: { ...state.job, running: null } };
      return settle(event.failure === null ? finished : withLogEntry(finished, { kind: 'error', text: event.failure }), [{ kind: 'render' }]);
    }
    case 'action_failed':
      return { state: { ...state, message: event.message }, effects: [{ kind: 'render' }] };
  }
}

function onLedgerLoaded(state: WrapperState, event: Extract<WrapperEvent, { kind: 'ledger_loaded' }>): WrapperState {
  const ids = event.reviews.map((review) => review.id);
  const firstLoad = state.ledger === null;
  return {
    ...state,
    ledger: event.ledger,
    reviews: event.reviews,
    cursor: Math.min(state.cursor, Math.max(0, event.reviews.length - 1)),
    unticked: state.unticked.filter((id) => ids.includes(id)),
    rejecting: state.rejecting !== null && ids.includes(state.rejecting.id) ? state.rejecting : null,
    planner: { ...state.planner, newsSeq: event.newsSeq, nudgedSeq: firstLoad ? event.newsSeq : state.planner.nudgedSeq },
  };
}

function typeIntoPlanner(state: WrapperState, text: string): Transition {
  const planner = state.planner.idle ? { ...state.planner, typedSinceIdle: true } : state.planner;
  return { state: { ...state, planner }, effects: [{ kind: 'write_planner', text }] };
}

function onPanelInput(state: WrapperState, text: string): Transition {
  let current = state;
  let rest = text;
  const effects: WrapperEffect[] = [];
  while (rest.length > 0) {
    const read = readNextPanelKey(rest, current.rejecting !== null);
    rest = read.rest;
    if (read.key === null) {
      continue;
    }
    const next = current.rejecting === null ? onPanelKey(current, read.key) : onReasonKey(current, read.key);
    current = next.state;
    effects.push(...next.effects);
  }
  return { state: current, effects: [...effects, { kind: 'render' }] };
}

function onPanelKey(state: WrapperState, key: PanelKey): Transition {
  const base = { ...state, confirmQuit: false, message: null };
  switch (key) {
    case 'up':
      return { state: { ...base, cursor: Math.max(0, state.cursor - 1) }, effects: [] };
    case 'down':
      return { state: { ...base, cursor: Math.min(Math.max(0, state.reviews.length - 1), state.cursor + 1) }, effects: [] };
    case 'page_up':
    case 'page_down': {
      const viewport = logViewport(base);
      const step = Math.max(1, viewport.room - 1);
      const logScroll = key === 'page_up' ? Math.min(viewport.maxScroll, state.logScroll + step) : Math.max(0, state.logScroll - step);
      return { state: { ...base, logScroll }, effects: [] };
    }
    case 'end':
      return { state: { ...base, logScroll: 0 }, effects: [] };
    case 'tick': {
      const id = state.reviews[state.cursor]?.id;
      if (id === undefined) {
        return { state: base, effects: [] };
      }
      const unticked = state.unticked.includes(id) ? state.unticked.filter((other) => other !== id) : [...state.unticked, id];
      return { state: { ...base, unticked }, effects: [] };
    }
    case 'approve':
    case 'enter': {
      const ticked = state.reviews.filter((review) => !state.unticked.includes(review.id));
      if (ticked.length === 0) {
        return { state: { ...base, message: 'Nothing ticked, so nothing was approved.' }, effects: [] };
      }
      const requests = ticked.map((review) => ({ id: review.id, version: review.version }));
      return {
        state: { ...base, message: `Approved ${requests.map((request) => `${request.id} v${request.version}`).join(', ')}.` },
        effects: [{ kind: 'approve', requests }],
      };
    }
    case 'reject': {
      const id = state.reviews[state.cursor]?.id;
      return { state: id === undefined ? base : { ...base, rejecting: { id, reason: '' } }, effects: [] };
    }
    case 'quit':
      return state.confirmQuit
        ? { state: base, effects: [{ kind: 'quit' }] }
        : { state: { ...base, confirmQuit: true, message: 'Press q again to quit pacties; the planner session ends too.' }, effects: [] };
    default:
      return { state: base, effects: [] };
  }
}

function onReasonKey(state: WrapperState, key: PanelKey): Transition {
  const rejecting = state.rejecting!;
  if (key === 'escape') {
    return { state: { ...state, rejecting: null, message: 'Rejection cancelled.' }, effects: [] };
  }
  if (key === 'backspace') {
    return { state: { ...state, rejecting: { ...rejecting, reason: Array.from(rejecting.reason).slice(0, -1).join('') } }, effects: [] };
  }
  if (key === 'enter') {
    const reason = rejecting.reason.trim();
    if (reason.length === 0) {
      return { state: { ...state, message: 'Type a reason so the planner knows why.' }, effects: [] };
    }
    return { state: { ...state, rejecting: null, message: `Rejected ${rejecting.id}.` }, effects: [{ kind: 'reject', id: rejecting.id, reason }] };
  }
  if (typeof key === 'object') {
    return { state: { ...state, rejecting: { ...rejecting, reason: rejecting.reason + key.char } }, effects: [] };
  }
  return { state, effects: [] };
}

function onJobEvent(state: WrapperState, event: Extract<WrapperEvent, { kind: 'job_event' }>['event']): Transition {
  const logged = event.kind === 'session' ? state : withLogEntry(state, event.entry);
  const testerSessionId = event.kind === 'log' ? null : event.sessionId;
  const plannerSessionId = state.job.running?.plannerSessionId;
  if (testerSessionId === null || plannerSessionId === undefined || logged.job.pairs[plannerSessionId] === testerSessionId) {
    return { state: logged, effects: [{ kind: 'render' }] };
  }
  const pairs = { ...logged.job.pairs, [plannerSessionId]: testerSessionId };
  return { state: { ...logged, job: { ...logged.job, pairs } }, effects: [{ kind: 'save_pairs', pairs }, { kind: 'render' }] };
}

function settle(state: WrapperState, effects: WrapperEffect[]): Transition {
  const dispatched = dispatchTesterJob(state);
  const nudged = nudgePlanner(dispatched.state);
  return { state: nudged.state, effects: [...effects, ...dispatched.effects, ...nudged.effects] };
}

function dispatchTesterJob(state: WrapperState): Transition {
  const plannerSessionId = state.planner.sessionId;
  if (state.job.running !== null || state.ledger === null || plannerSessionId === null) {
    return { state, effects: [] };
  }
  const work = pendingTestWork(state.ledger);
  if (!work.some((request) => !state.job.dispatched.includes(workKey(request)))) {
    return { state, effects: [] };
  }
  const started: JobLogEntry = { kind: 'text', text: `Tester job started for ${work.map((request) => `${request.id} v${request.version}`).join(', ')}` };
  const running = {
    ...state,
    job: { ...state.job, running: { requests: work, plannerSessionId }, dispatched: [...new Set([...state.job.dispatched, ...work.map(workKey)])] },
  };
  return {
    state: withLogEntry(running, started),
    effects: [{ kind: 'start_job', requests: work, sessionId: state.job.pairs[plannerSessionId] ?? null }],
  };
}

function nudgePlanner(state: WrapperState): Transition {
  const { planner } = state;
  if (!planner.idle || planner.typedSinceIdle || planner.newsSeq <= planner.nudgedSeq || state.job.running !== null) {
    return { state, effects: [] };
  }
  return {
    state: { ...state, planner: { ...planner, idle: false, nudgedSeq: planner.newsSeq } },
    effects: [{ kind: 'nudge_planner', text: PLANNER_NUDGE }],
  };
}

function withLogEntry(state: WrapperState, entry: JobLogEntry): WrapperState {
  const log = [...state.job.log, entry].slice(-MAX_LOG_ENTRIES);
  const logScroll = state.logScroll === 0 ? 0 : state.logScroll + logEntryRows(entry, state.panelSize.width).length;
  return clampLogScroll({ ...state, logScroll, job: { ...state.job, log } });
}

function clampLogScroll(state: WrapperState): WrapperState {
  return { ...state, logScroll: Math.min(state.logScroll, logViewport(state).maxScroll) };
}
