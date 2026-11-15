// Bot lab: one pairing for ladder.ts, played both ways round. Prints {"a": wins, "b": wins}.
//   npx tsx scripts/bot-lab/ladder-game.ts <a> <b> <pair>
// A player is a level (`hard`, or `hard~0.2` blundering 20% of the time: plays the pair's decks, swapped for the second game, so the decks
// cancel out) or a duelist (`kaiba:bc`, `kaiba:bc+`: their own deck, at their own level unless one
// is given as `kaiba:bc@normal`).
import type { OcgMessage } from 'ocgcore-wasm';
import { DUELISTS, duelistDeck } from '@ygo/shared';
import { botAnswer, type BotLevel } from '@ygo/duel/bot';
import { loadEngine } from '../../src/duel/engine';
import { DUEL_RULES, DuelSession, type Team } from '@ygo/duel/session';

const [specA, specB, pairArg = '0'] = process.argv.slice(2);
const pair = Number(pairArg);
const engine = await loadEngine();
engine.simCore();
while (!engine.simCore()) await new Promise((r) => setTimeout(r, 10));

type Deck = ReturnType<typeof duelistDeck>['deck'];
/** Decks of the duelists above Easy (and their competitive builds), for players given as a level. */
const POOL: Deck[] = DUELISTS.filter((d) => d.level !== 'easy').flatMap((d) => d.eras.flatMap((e) => [e.id, ...(e.competitive ? [`${e.id}+`] : [])].map((era) => duelistDeck(d, era).deck)));

function player(full: string): { level: string; blunder: number; deck?: Deck } {
    const [spec, b] = full.split('~');
    const blunder = Number(b ?? 0);
    const [who, level] = spec!.split('@');
    if (!who!.includes(':')) return { level: who!, blunder };
    const [id, era] = who!.split(':');
    const d = DUELISTS.find((x) => x.id === id);
    if (!d) throw new Error(`No duelist ${id}`);
    return { level: level ?? d.level, blunder, deck: duelistDeck(d, era).deck };
}
const a = player(specA!), b = player(specB!);
const x = POOL[(pair * 7 + 3) % POOL.length]!, y = POOL[(pair * 13 + 8) % POOL.length]!;
const wins = { a: 0, b: 0 };
for (const round of [0, 1] as const) {
    // Each goes first once; a level's deck is the pair's, swapped between the games.
    const aSeat: Team = round === 0 ? 0 : 1;
    const deckA = a.deck ?? (round === 0 ? x : y), deckB = b.deck ?? (round === 0 ? y : x);
    const who = aSeat === 0 ? [a, b] : [b, a];
    const answerer = (m: OcgMessage, d: DuelSession, t: Team) => {
        Object.assign(d.setup, { botLevel: who[t]!.level, botBlunder: who[t]!.blunder });
        return botAnswer(m, d, t);
    };
    const duel = new DuelSession(engine, { seed: [String(70000 + pair * 2 + round), '11400714819323198485', '77', '2685821657736338717'], mode: 'MR3', decks: aSeat === 0 ? [deckA, deckB] : [deckB, deckA], names: ['A', 'B'], bots: [true, true], rules: DUEL_RULES } as never, { answerer });
    try {
        duel.start();
    } catch {
        continue;
    }
    const w = duel.result?.winner;
    if (w === 0 || w === 1) wins[w === aSeat ? 'a' : 'b']++;
}
void (null as unknown as BotLevel);
console.log(JSON.stringify(wins));
