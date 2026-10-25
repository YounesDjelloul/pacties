import path from 'node:path';
import { readEvents } from '@/data/event-log';
import { spawnPseudoTerminal } from '@/data/pty';
import { createTerminalMirror } from '@/data/terminal-mirror';
import { withRunLock } from '@/data/storage-lock';
import { eventsPath } from '@/data/storage-paths';
import { readSessionPairs, writeSessionFile, writeSessionPairs } from '@/data/testing-files';
import { watchFileChanges } from '@/data/watch-file';
import { buildPlannerClaudeArgs, buildPlannerSessionSettings, knownPlannerSessionId } from '@/domain/clients/planner-session';
import { foldLedger } from '@/domain/ledger/fold-ledger';
import { pendingReviews } from '@/domain/ledger/review';
import { splitInput } from '@/domain/wrapper/keys';
import { renderPanel } from '@/domain/wrapper/render-panel';
import { statusLine } from '@/domain/wrapper/status-line';
import { INITIAL_PLANNER_MODES, pauseInputModes, restoreModes, terminalTitle, trackPlannerModes, usesAlternateScreen } from '@/domain/wrapper/terminal-modes';
import { initialWrapperState, latestPlannerNewsSeq, reduceWrapper } from '@/domain/wrapper/wrapper-state';
import { config } from '@/lib/config';
import { approveBehaviors } from '@/shell/ledger/approve-behaviors';
import { unwrapFold } from '@/shell/ledger/load-ledger';
import { rejectBehavior } from '@/shell/ledger/reject-behavior';
import { readRecordedPlannerReport } from '@/shell/wrapper/planner-activity';
import { runTesterJob } from '@/shell/wrapper/tester-jobs';
import type { Launcher } from '@/domain/clients/types';
import type { Project } from '@/domain/project/types';
import type { PlannerLaunch, Screen, WrapperEffect, WrapperEvent, WrapperState } from '@/domain/wrapper/types';
import type { WrapperTerminal } from '@/shell/wrapper/types';

const NUDGE_SUBMIT_DELAY_MS = 150;
const ESC = '\u001b';

export async function runWrapper(project: Project, launcher: Launcher, terminal: WrapperTerminal, now: () => Date, launch: PlannerLaunch): Promise<number> {
  const sessionDir = path.join(project.dir, 'planner-session');
  const settingsFile = path.join(sessionDir, 'settings.json');
  const reportFile = path.join(sessionDir, 'report.json');
  await withRunLock(project.dir, async (lock) => {
    await writeSessionFile(project.dir, settingsFile, buildPlannerSessionSettings(launcher, reportFile), lock);
    await writeSessionFile(project.dir, reportFile, { activity: 'busy', sessionId: knownPlannerSessionId(launch) }, lock);
  });

  const planner = spawnPseudoTerminal(config.claudeBin, buildPlannerClaudeArgs(settingsFile, launch), project.repoRoot, terminal.columns(), terminal.rows(), process.env);
  const mirror = createTerminalMirror(terminal.columns(), terminal.rows());

  const jobs = new AbortController();
  let state: WrapperState = initialWrapperState(knownPlannerSessionId(launch), await readSessionPairs(project.dir));
  let shownScreen: Screen = 'planner';
  let plannerModes = INITIAL_PLANNER_MODES;
  let panelOverPlannerScreen = false;
  let hiddenOutput: string[] = [];
  let shownTitle = '';
  let finish: (code: number) => void = () => undefined;
  const finished = new Promise<number>((resolve) => {
    finish = resolve;
  });

  const panelSize = () => ({ width: terminal.columns(), height: Math.max(1, terminal.rows() - 1) });

  const dispatch = (event: WrapperEvent) => {
    const transition = reduceWrapper(state, event);
    state = transition.state;
    for (const effect of transition.effects) {
      void apply(effect);
    }
  };

  const reloadLedger = async () => {
    try {
      const events = await readEvents(project.dir);
      const ledger = unwrapFold(foldLedger(events), project);
      dispatch({ kind: 'ledger_loaded', ledger, reviews: pendingReviews(ledger), newsSeq: latestPlannerNewsSeq(events) });
    } catch (error) {
      dispatch({ kind: 'action_failed', message: messageOf(error) });
    }
  };

  const readActivity = async () => {
    const report = await readRecordedPlannerReport(reportFile);
    if (report === null) {
      return;
    }
    if (report.sessionId !== null) {
      dispatch({ kind: 'planner_session', sessionId: report.sessionId });
    }
    dispatch({ kind: report.activity === 'idle' ? 'planner_idle' : 'planner_busy' });
  };

  const updateTitle = () => {
    const title = statusLine(state, 200);
    if (title !== shownTitle) {
      shownTitle = title;
      terminal.write(terminalTitle(title));
    }
  };

  const drawPanel = () => {
    const rows = terminal.rows();
    const size = panelSize();
    const lines = renderPanel(state, size.width, size.height);
    terminal.write(`${ESC}[?25l${ESC}[H${ESC}[2J${lines.join('\r\n')}${ESC}[${rows};1H${ESC}[7m${statusLine(state, terminal.columns())}${ESC}[0m`);
  };

  const showPanel = () => {
    if (shownScreen !== 'pacties') {
      panelOverPlannerScreen = usesAlternateScreen(plannerModes);
      terminal.write(panelOverPlannerScreen ? pauseInputModes(plannerModes) : `${ESC}[?1049h`);
    }
    shownScreen = 'pacties';
    drawPanel();
  };

  const showPlanner = async () => {
    shownScreen = 'planner';
    const replay = hiddenOutput.join('');
    hiddenOutput = [];
    if (panelOverPlannerScreen) {
      const screen = await mirror.snapshot();
      terminal.write(`${ESC}[0m${ESC}[H${ESC}[2J${screen}${restoreModes(plannerModes)}`);
      return;
    }
    terminal.write(`${ESC}[?25h${ESC}[?1049l${replay}`);
  };

  const render = async () => {
    updateTitle();
    if (state.screen === 'pacties') {
      showPanel();
      return;
    }
    if (shownScreen === 'pacties') {
      await showPlanner();
    }
  };

  const apply = async (effect: WrapperEffect) => {
    switch (effect.kind) {
      case 'render':
        await render();
        return;
      case 'write_planner':
        planner.write(effect.text);
        return;
      case 'nudge_planner':
        planner.write(effect.text);
        setTimeout(() => planner.write('\r'), NUDGE_SUBMIT_DELAY_MS);
        return;
      case 'save_pairs':
        await withRunLock(project.dir, (lock) => writeSessionPairs(project.dir, effect.pairs, lock)).catch((error: unknown) =>
          dispatch({ kind: 'action_failed', message: messageOf(error) }),
        );
        return;
      case 'start_job': {
        const outcome = await runTesterJob(project, launcher, effect.requests, effect.sessionId, (event) => dispatch({ kind: 'job_event', event }), jobs.signal).catch(
          (error: unknown) => ({ sessionId: effect.sessionId, failure: messageOf(error) }),
        );
        dispatch({ kind: 'job_finished', failure: outcome.failure });
        return;
      }
      case 'approve':
        await approveBehaviors(project, effect.requests, now()).catch((error: unknown) => dispatch({ kind: 'action_failed', message: messageOf(error) }));
        await reloadLedger();
        return;
      case 'reject':
        await rejectBehavior(project, { id: effect.id, reason: effect.reason }, now()).catch((error: unknown) => dispatch({ kind: 'action_failed', message: messageOf(error) }));
        await reloadLedger();
        return;
      case 'quit':
        planner.kill();
        finish(0);
        return;
    }
  };

  terminal.start();
  planner.onData((data) => {
    plannerModes = trackPlannerModes(plannerModes, data);
    mirror.write(data);
    if (shownScreen === 'planner') {
      terminal.write(data);
    } else {
      hiddenOutput.push(data);
    }
  });
  planner.onExit((exitCode) => finish(exitCode));
  terminal.onInput((chunk) => {
    for (const segment of splitInput(chunk)) {
      dispatch({ kind: 'input', segment });
    }
  });
  terminal.onResize(() => {
    planner.resize(terminal.columns(), terminal.rows());
    mirror.resize(terminal.columns(), terminal.rows());
    dispatch({ kind: 'panel_resized', size: panelSize() });
  });

  const stopWatchingLedger = watchFileChanges(eventsPath(project.dir), () => void reloadLedger());
  const stopWatchingActivity = watchFileChanges(reportFile, () => void readActivity());
  dispatch({ kind: 'panel_resized', size: panelSize() });
  await reloadLedger();

  const exitCode = await finished;
  jobs.abort();
  stopWatchingLedger();
  stopWatchingActivity();
  mirror.dispose();
  const onPanel = (shownScreen as Screen) === 'pacties';
  const leaveScreen = onPanel || usesAlternateScreen(plannerModes) ? `${ESC}[?1049l` : '';
  terminal.write(`${ESC}[0m${ESC}[?1000l${ESC}[?1002l${ESC}[?1003l${ESC}[?1006l${ESC}[?1004l${ESC}[?2004l${ESC}[?25h${leaveScreen}${terminalTitle('')}`);
  terminal.stop();
  return exitCode;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
