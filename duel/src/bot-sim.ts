import { OcgMessageType as M, type OcgMessage, type OcgResponse } from 'ocgcore-wasm';
import { evaluate, WIN_VALUE } from './bot-eval';
import { DuelSession, type Team } from './session';

/*
 * The bot's look-ahead: a copy of the duel, rebuilt from its seed and answers (about 20-30 ms),
 * where the bot tries an answer and plays on until it next chooses an action (or the rival does):
 * the answer's card resolved, the chain over. Then the position is scored from what the bot sees.
 *
 * Played `through` (the hard bot), the copy goes on past the bot's next action: it plays the rest
 * of its Main Phase by plain play, to its Battle Phase (or, after it, into the rival's turn), so a
 * play that sets up the next (Change of Heart, then a Tribute) is seen, and so is what an effect
 * leaves at the end of the turn (the monster Change of Heart took going back).
 *
 * The copy holds what the bot can't know (the rival's hand, Set cards, the deck's order), so it
 * never lets them act: in the copy the rival passes every chance to respond, and the score only
 * looks at the bot's view of the board.
 */

class Stop extends Error {}

/** Questions answered in the copy after the tried one, at most (a runaway loop of effects). */
const MAX_STEPS = 80;

export type SimPolicy = (m: OcgMessage, duel: DuelSession, team: Team, bot: Team) => OcgResponse;

/** Running totals, for the lab (how much looking ahead costs). */
export const simStats = { runs: 0, ms: 0 };

/**
 * The bot's score of the position after `first` answers the question the duel is waiting on, or
 * null if the engine wouldn't take that answer.
 */
export function simulate(duel: DuelSession, team: Team, first: OcgResponse, policy: SimPolicy, through = false): number | null {
    const started = performance.now();
    let tried = false, steps = 0;
    const copy = new DuelSession(duel.engine, { ...duel.setup, bots: [true, true], solo: false }, {
        answerer: (m, d, t) => {
            if (!tried) {
                tried = true;
                return first;
            }
            const ownIdle = m.type === M.SELECT_IDLECMD && t === team;
            if (++steps > MAX_STEPS || m.type === M.SELECT_BATTLECMD || (m.type === M.SELECT_IDLECMD && !(through && ownIdle))) throw new Stop();
            return policy(m, d, t, team);
        },
    });
    try {
        copy.start(duel.answers);
    } catch (e) {
        if (!(e instanceof Stop)) {
            copy.destroy();
            return null;
        }
    }
    let score: number;
    if (copy.result) score = copy.result.winner === null ? 0 : copy.result.winner === team ? WIN_VALUE : -WIN_VALUE;
    else score = evaluate(copy.view(team), duel.engine);
    copy.destroy();
    simStats.runs++;
    simStats.ms += performance.now() - started;
    return score;
}
