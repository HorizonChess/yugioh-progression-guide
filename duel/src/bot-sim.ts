import { OcgMessageType as M, OcgResponseType as R, SelectIdleCMDAction as I, type OcgMessage, type OcgResponse } from 'ocgcore-wasm';
import { evaluate, WIN_VALUE } from './bot-eval';
import { DuelSession, type Team } from './session';

/*
 * The bot's look-ahead: a copy of the duel, rebuilt from its seed and answers (about 20-30 ms),
 * where the bot tries an answer and plays on until it next chooses an action (or the rival does):
 * the answer's card resolved, the chain over. Then the position is scored from what the bot sees.
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
const MAX_STEPS = 80, MAX_STEPS_THROUGH = 160;

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
    // Played through, the best of the positions it could stop at (each of its own chances to act, and
    // the end): it decides again at each, so the plain play after a stop never counts against a play.
    let best = -Infinity;
    const copy = new DuelSession(duel.engine, { ...duel.setup, bots: [true, true], solo: false }, {
        answerer: (m, d, t) => {
            if (!tried) {
                tried = true;
                return first;
            }
            const own = t === team && d.currentTurnPlayer === team;
            const turnsAction = m.type === M.SELECT_IDLECMD || m.type === M.SELECT_BATTLECMD;
            if (++steps > (through ? MAX_STEPS_THROUGH : MAX_STEPS)) throw new Stop();
            // Looking one action ahead it stops at the next; played through, at the rival's on their turn.
            if (turnsAction && !(through && own)) throw new Stop();
            if (m.type === M.SELECT_IDLECMD) {
                // The rest of this Main Phase is the bot's own next choice: on to the battle.
                if (d.currentPhase === 'M1') return { type: R.SELECT_IDLECMD, action: m.to_bp ? I.TO_BP : I.TO_EP, index: null };
                best = Math.max(best, evaluate(d.view(team), duel.engine, true));
            }
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
    else score = through ? Math.max(best, evaluate(copy.view(team), duel.engine, true)) : evaluate(copy.view(team), duel.engine);
    copy.destroy();
    simStats.runs++;
    simStats.ms += performance.now() - started;
    return score;
}
