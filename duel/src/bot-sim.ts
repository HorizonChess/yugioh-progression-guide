import { OcgMessageType as M, OcgResponseType as R, SelectIdleCMDAction as I, type OcgCoreSync, type OcgMessage, type OcgResponse } from 'ocgcore-wasm';
import { evaluate, WIN_VALUE } from './bot-eval';
import { beliefOf, guessScript, rng, type Belief } from './bot-belief';
import { engineFaulted, type Engine } from './engine';
import { DuelSession, type SessionOptions, type Team } from './session';

/*
 * The bot's look-ahead: a copy of the duel where the bot tries an answer and plays on until it
 * next chooses an action (or the rival does): the answer's card resolved, the chain over. Then the
 * position is scored from what the bot sees.
 *
 * The copy is forked: built from the duel's seed and answers on a WASM core of its own
 * (Engine.simCore), stopped where the duel is, and saved there (the core's memory and the session's
 * state). Each answer tried starts from that save, put back (a copy of memory, about 2 ms, where
 * rebuilding took 12-20 ms and grew with the duel), and as the duel goes on the copy goes on with
 * it from the save. Until that core is ready, each try rebuilds the copy on the duel's own core.
 *
 * With a `guess` number, the copy is one guess at what the bot can't see (bot-belief.ts): the rival's
 * hidden cards are made cards it might hold, so the policy may let the rival respond with them.
 *
 * Played `through` (the hard bot, choosing what to do on its turn), the copy goes on to the end of
 * the bot's turn: the play, then on to the Battle Phase (nothing more in this Main Phase: that is
 * for the bot to choose next), its attacks by plain play, and its Main Phase 2 by plain play, until
 * the rival is next to act on their own turn. So the attacks a play opens up are seen (a wall
 * destroyed, then a direct attack), what it sets up after the battle (Change of Heart, attack, then
 * a Tribute), and what an effect leaves at the end of the turn (the monster Change of Heart took
 * going back). Every line is scored the same way, as the turn ends (no battle still to come either
 * side, only what each side's monsters threaten); in Main Phase 2 it may stop at any point, so the
 * plain play there never counts against a play.
 *
 * The copy holds what the bot can't know (the rival's hand, Set cards, the deck's order), so it
 * never lets them act: in the copy the rival passes every chance to respond, and the score only
 * looks at the bot's view of the board.
 */

class Stop extends Error {}

/** Questions answered in the copy after the tried one, at most (a runaway loop of effects); a whole turn when played through. */
const MAX_STEPS = 80, MAX_STEPS_THROUGH = 160, MAX_STEPS_RIVAL = 500;

/**
 * How far the copy plays on: to the bot's next choice (false), to the end of its turn (true), or to
 * the end of its turn with the rest of this Main Phase played by plain play too (`rollout`), or
 * through the rival's next turn (`rival`): in a copy where what the bot can't see is a guess
 * (bot-belief.ts), so the rival plays too, responding and taking its turn, by `policy`.
 */
export type Through = boolean | 'rollout' | 'rival';

export type SimPolicy = (m: OcgMessage, duel: DuelSession, team: Team, bot: Team) => OcgResponse;

/** Running totals, for the lab (how much looking ahead costs, and how much of it is rebuilding the duel). */
export const simStats = { runs: 0, ms: 0, replayMs: 0, forks: 0, guessed: 0, guessFailed: 0 };
/** For the lab: whether to fork (false: rebuild the copy for every try, as before). */
export const simTuning = { fork: true };

type Answerer = NonNullable<SessionOptions['answerer']>;

/** The copy's answers: `first`, then on as far as the look-ahead goes. Tracks the best stop. */
function answerer(duel: DuelSession, team: Team, first: OcgResponse, policy: SimPolicy, through: Through, started: number) {
    let tried = false, steps = 0;
    const startTurn = duel.view(team).turn;
    // Played through, the best of the positions it could stop at (each of its own chances to act, and
    // the end): it decides again at each, so the plain play after a stop never counts against a play.
    const out = { best: -Infinity, answer: null as unknown as Answerer };
    out.answer = (m, d, t) => {
        if (!tried) {
            tried = true;
            simStats.replayMs += performance.now() - started;
            return first;
        }
        const own = t === team && d.currentTurnPlayer === team;
        const turnsAction = m.type === M.SELECT_IDLECMD || m.type === M.SELECT_BATTLECMD;
        if (through === 'rival') {
            // On through the rival's turn: to the bot's next chance to act on a turn of its own.
            if (++steps > MAX_STEPS_RIVAL || (own && turnsAction && d.view(team).turn > startTurn)) throw new Stop();
            if (own && m.type === M.SELECT_IDLECMD && d.currentPhase === 'M1') return { type: R.SELECT_IDLECMD, action: m.to_bp ? I.TO_BP : I.TO_EP, index: null };
            return policy(m, d, t, team);
        }
        if (++steps > (through ? MAX_STEPS_THROUGH : MAX_STEPS)) throw new Stop();
        // Looking one action ahead it stops at the next; played through, at the rival's on their turn.
        if (turnsAction && !(through && own)) throw new Stop();
        if (m.type === M.SELECT_IDLECMD) {
            // The rest of this Main Phase is the bot's own next choice: on to the battle.
            // (Or, `rollout`, the rest of it by plain play: what the tried play leads on to this phase.)
            if (d.currentPhase === 'M1') return through === 'rollout' ? policy(m, d, t, team) : { type: R.SELECT_IDLECMD, action: m.to_bp ? I.TO_BP : I.TO_EP, index: null };
            out.best = Math.max(out.best, evaluate(d.view(team), duel.engine, true));
        }
        return policy(m, d, t, team);
    };
    return out;
}

function score(copy: DuelSession, duel: DuelSession, team: Team, best: number, through: Through): number {
    if (copy.result) return copy.result.winner === null ? 0 : copy.result.winner === team ? WIN_VALUE : -WIN_VALUE;
    if (through === 'rival') return evaluate(copy.view(team), duel.engine);
    return through ? Math.max(best, evaluate(copy.view(team), duel.engine, true)) : evaluate(copy.view(team), duel.engine);
}

/**
 * The bot's score of the position after `first` answers the question the duel is waiting on, or
 * null if the engine wouldn't take that answer.
 */
export function simulate(duel: DuelSession, team: Team, first: OcgResponse, policy: SimPolicy, through: Through = false, guess?: number): number | null {
    const started = performance.now();
    let result: number | null | undefined;
    if (simTuning.fork) {
        try {
            const f = forkOf(duel);
            if (f) result = tryFork(f, duel, team, first, policy, through, started, guess);
        } catch (e) {
            if (!engineFaulted(e)) throw e;
            // The look-ahead's core is broken: a new one, and this try rebuilt on the duel's own core.
            duel.engine.dropSimCore();
            fork = null;
        }
    }
    // (Through the rival's turn needs the guesses, which need the look-ahead's own core: never the real cards.)
    if (result === undefined && (through === 'rival' || guess !== undefined)) {
        if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.DEBUG_SIM) console.log('rival look-ahead without a fork', !!duel.engine.simCore());
        return null;
    }
    if (result === undefined) result = replayed(duel, team, first, policy, through, started);
    simStats.runs++;
    simStats.ms += performance.now() - started;
    return result;
}

/** The copy rebuilt from the duel's seed and answers, on the duel's own core, for one try. */
function replayed(duel: DuelSession, team: Team, first: OcgResponse, policy: SimPolicy, through: Through, started: number): number | null {
    const a = answerer(duel, team, first, policy, through, started);
    const copy = new DuelSession(duel.engine, { ...duel.setup, bots: [true, true], solo: false }, { answerer: a.answer, unwatched: true });
    try {
        copy.start(duel.answers);
    } catch (e) {
        if (!(e instanceof Stop)) {
            copy.destroy();
            if (engineFaulted(e)) throw e;
            return null;
        }
    }
    const s = score(copy, duel, team, a.best, through);
    copy.destroy();
    return s;
}

// ---- forking ------------------------------------------------------------------------------

interface Memory {
    heap: Uint8Array;
    stack: number;
}
interface Fork {
    /** The duel and the question it's a copy at (its answers so far). */
    duel: DuelSession;
    at: number;
    core: OcgCoreSync;
    copy: DuelSession;
    options: SessionOptions;
    memory: Memory;
    state: Record<string, unknown>;
    /** The copy's entry in the core's table of duel callbacks (dropped with the fork). */
    callbacks: number[];
}
let fork: Fork | null = null;
/** Each look-ahead core's memory before any copy was made on it: put back before the next. */
const pristine = new WeakMap<OcgCoreSync, Memory>();

/** ocgcore-wasm's own module (its memory) and table of duel callbacks, behind a symbol. */
function internals(core: OcgCoreSync) {
    const key = Object.getOwnPropertySymbols(core).find((s) => s.description === 'OcgCoreInternal');
    const inner = key && (core as unknown as Record<symbol, { module: { HEAPU8: Uint8Array; stackSave(): number; stackRestore(p: number): void }; callbacks: Map<number, unknown> }>)[key];
    if (!inner?.module?.HEAPU8) throw new Error('ocgcore-wasm has changed: the look-ahead can\'t save its memory');
    return inner;
}
/** The core's memory now, into `into` if given (and the same size). */
function save(core: OcgCoreSync, into?: Memory): Memory {
    const { module } = internals(core);
    if (into && into.heap.length === module.HEAPU8.length) {
        into.heap.set(module.HEAPU8);
        into.stack = module.stackSave();
        return into;
    }
    return { heap: module.HEAPU8.slice(), stack: module.stackSave() };
}
function load(core: OcgCoreSync, memory: Memory) {
    const { module } = internals(core);
    // (Memory may have grown since: what's past the saved part was free then, and is again.)
    module.HEAPU8.set(memory.heap);
    module.stackRestore(memory.stack);
}

/** The copy of `duel` at its question, saved, on the look-ahead's core; null if that's not ready. */
function forkOf(duel: DuelSession): Fork | null {
    const core = duel.engine.simCore();
    if (!core) return null;
    if (fork && fork.duel === duel && fork.core === core && fork.at <= duel.answers.length) {
        if (fork.at === duel.answers.length) return fork;
        // The duel has gone on: the copy goes on with it, from its save.
        const started = performance.now();
        load(core, fork.memory);
        fork.copy.loadState(fork.state);
        fork.options.pauseForBot = true;
        fork.options.answerer = undefined;
        if (fork.copy.catchUp(duel.answers.slice(fork.at)) && fork.copy.answers.length === duel.answers.length) {
            fork.at = duel.answers.length;
            fork.memory = save(core, fork.memory);
            fork.state = fork.copy.saveState();
            simStats.replayMs += performance.now() - started;
            return fork;
        }
    }
    const started = performance.now();
    drop();
    if (!pristine.has(core)) pristine.set(core, save(core));
    else load(core, pristine.get(core)!);
    const table = internals(core).callbacks, before = new Set(table.keys());
    const options: SessionOptions = { pauseForBot: true, unwatched: true };
    const engine: Engine = Object.create(duel.engine, { core: { value: core } });
    const copy = new DuelSession(engine, { ...duel.setup, bots: [true, true], solo: false }, options);
    copy.start(duel.answers);
    const callbacks = [...table.keys()].filter((k) => !before.has(k));
    // It stops at the bot's question, where the duel is (else there's nothing to try from).
    if (!copy.botToThink) {
        for (const k of callbacks) table.delete(k);
        return null;
    }
    fork = { duel, at: duel.answers.length, core, copy, options, memory: save(core), state: copy.saveState(), callbacks };
    simStats.forks++;
    simStats.replayMs += performance.now() - started;
    return fork;
}

/** Lets go of the fork (its copy's callbacks; its memory is overwritten by the next). */
function drop() {
    if (!fork) return;
    const table = internals(fork.core).callbacks;
    for (const k of fork.callbacks) table.delete(k);
    fork = null;
}

function tryFork(f: Fork, duel: DuelSession, team: Team, first: OcgResponse, policy: SimPolicy, through: Through, started: number, guess: number | undefined): number | null {
    load(f.core, f.memory);
    f.copy.loadState(f.state);
    // Through the rival's turn: what the bot can't see made a guess first (the same guess for every
    // answer tried with this number, so they're compared on the same footing).
    if (guess !== undefined) {
        const belief = beliefFor(duel, team);
        if (!f.copy.runScript(guessScript(f.copy, team, belief, rng(hash(duel.setup.seed[0]) ^ (duel.answers.length * 7919) ^ (guess * 104729))))) {
            simStats.guessFailed++;
            return null;
        }
        simStats.guessed++;
    }
    const a = answerer(duel, team, first, policy, through, started);
    f.options.pauseForBot = false;
    f.options.answerer = a.answer;
    try {
        f.copy.botThink();
    } catch (e) {
        if (!(e instanceof Stop)) {
            if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.DEBUG_SIM) console.log('copy failed:', (e as Error).message);
            if (engineFaulted(e)) throw e;
            return null;
        }
    }
    return score(f.copy, duel, team, a.best, through);
}

let belief: { duel: DuelSession; at: number; team: Team; belief: Belief } | null = null;
/** The bot's belief about what it can't see, worked out once per decision. */
function beliefFor(duel: DuelSession, team: Team): Belief {
    if (!belief || belief.duel !== duel || belief.at !== duel.answers.length || belief.team !== team) belief = { duel, at: duel.answers.length, team, belief: beliefOf(duel, team) };
    return belief.belief;
}
const hash = (s: string) => {
    let h = 2166136261;
    for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
};
