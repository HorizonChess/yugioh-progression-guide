import { describe, expect, it } from 'vitest';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession, type Team } from '@ygo/duel/session';
import type { DuelAnswer, DuelView } from '@ygo/shared';

const MON = [91152256, 85639257, 53153481, 17535588, 89091579, 32452818, 89631139, 28279543, 9159938, 53375573, 36996508, 43500484, 40826495, 15025844];
const deck = { main: Array.from({ length: 40 }, (_, i) => MON[i % MON.length]!), extra: [] };
const uids = (v: DuelView) => [v.me, v.opp].flatMap((s) => [...s.hand, ...s.monsters, ...s.spells, ...s.grave].filter(Boolean).map((c) => `${c!.uid}=${c!.code}`)).join(' ');

// A game on a device is rebuilt from its answers (a card script fetched, Back): the cards must keep
// the uids the board already shows them by, however often the board (or the bot) looked meanwhile.
describe.skipIf(!engineDataAvailable())('card uids', () => it('are the same in a game rebuilt from its answers', async () => {
    const engine = await loadEngine();
    const setup = { seed: ['5', '11400714819323198485', '77', '2685821657736338717'] as [string, string, string, string], mode: 'MR1' as const, decks: [deck, deck], names: ['A', 'B'], bots: [false, true], rules: 4 as const };
    const live = new DuelSession(engine, setup, { pauseForBot: true });
    live.start();
    for (let i = 0; i < 300 && !live.result && live.view(0 as Team).turn < 7; i++) {
        while (live.botToThink) live.botThink();
        const s = live.state(0, 'd');
        live.view(1 as Team);
        const p = s.prompt;
        if (!p) break;
        let a: DuelAnswer;
        if (p.kind === 'actions') {
            const summon = p.actions.find((x) => x.verb === 'summon' || x.verb === 'set-monster');
            a = { kind: 'choice', id: (summon ?? p.next.find((n) => n.to === 'EP') ?? p.next[0]!).id };
        } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
        else if (p.kind === 'cards') a = { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
        else if (p.kind === 'place') a = { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
        else if (p.kind === 'yesno') a = { kind: 'choice', id: 1 };
        else a = { kind: 'choice', id: (p as { options: { id: number }[] }).options[0]!.id };
        expect(live.answer(0, s.seq, a)).toBe(true);
    }
    while (live.botToThink) live.botThink();
    const rebuilt = new DuelSession(engine, setup, { pauseForBot: true });
    rebuilt.start([...live.answers]);
    expect(rebuilt.view(0 as Team).turn).toBeGreaterThan(3);
    expect(uids(rebuilt.view(0 as Team))).toBe(uids(live.view(0 as Team)));
}));
