import { describe, expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '@ygo/duel/session';

const BLS = 504700118, MAGICIAN_OF_FAITH = 31560081, POT_OF_GREED = 55144522;
const MON = [91152256, 76184692, 90357090, 15025844, 4206964, 17814387, 74677422];

// An optional trigger that comes with another at the same moment is offered in a chain window, not
// as a yes/no of its own: Black Luster Soldier destroys a face-down Magician of Faith, which flips
// (its effect goes on the chain first). That window is its one chance: it's asked, and as Black
// Luster Soldier's effect (not "Respond to Magician of Faith?", which a player answers no to).
describe.skipIf(!engineDataAvailable())('an optional trigger among others', () => it("asks about Black Luster Soldier's second attack", async () => {
    const engine = await loadEngine();
    const deck = { main: MON.concat(MON, MON, MON, MON, MON), extra: [] };
    const duel = new DuelSession(engine, { seed: ['5', '11400714819323198485', '77', '2685821657736338717'], mode: 'MR1', decks: [deck, deck], names: ['A', 'B'], bots: [false, false], rules: 4 });
    duel.start();
    let placed = false, offered: DuelPrompt | null = null, attacked = 0;
    for (let i = 0; i < 400 && !duel.result && !offered; i++) {
        const team = duel.waitingFor()!;
        const s = duel.state(team, 'd');
        const p = s.prompt!;
        if (s.view.turn === 3 && team === 0 && p.kind === 'actions' && !placed) {
            placed = true;
            expect(duel.runScript([
                `Debug.AddCard(${BLS},0,0,LOCATION_MZONE,2,POS_FACEUP_ATTACK)`,
                `Debug.AddCard(${MAGICIAN_OF_FAITH},1,1,LOCATION_MZONE,2,POS_FACEDOWN_DEFENSE)`,
                `Debug.AddCard(${POT_OF_GREED},1,1,LOCATION_GRAVE,0,POS_FACEUP)`,
            ].join('\n'))).toBe(true);
            continue;
        }
        if (team === 0 && attacked && (p.kind === 'yesno' || (p.kind === 'chain' && p.options.some((o) => o.code === BLS)))) {
            offered = p;
            break;
        }
        let a: DuelAnswer;
        if (p.kind === 'actions') {
            const attack = s.view.turn === 3 && team === 0 && !attacked ? p.actions.find((x) => x.verb === 'attack' && x.code === BLS) : undefined;
            if (attack) attacked++;
            const bp = s.view.turn === 3 && team === 0 && s.view.phase === 'M1' && placed ? p.next.find((n) => n.to === 'BP') : undefined;
            a = { kind: 'choice', id: (attack ?? bp ?? p.next.find((n) => n.to === 'EP') ?? p.next[0]!).id };
        } else if (p.kind === 'chain') a = { kind: 'choice', id: p.pass ?? p.options[0]!.id };
        else if (p.kind === 'cards') a = { kind: 'many', ids: p.cards.slice(0, Math.max(p.min, 1)).map((c) => c.id) };
        else if (p.kind === 'place') a = { kind: 'many', ids: p.zones.slice(0, p.count).map((z) => z.id) };
        else if (p.kind === 'yesno') a = { kind: 'choice', id: 1 };
        else a = { kind: 'choice', id: (p as { options: { id: number }[] }).options[0]!.id };
        expect(duel.answer(team, s.seq, a), JSON.stringify(p).slice(0, 300)).toBe(true);
    }
    expect(offered).not.toBeNull();
    // Asked (never a quiet window the page passes on its own), and as Black Luster Soldier's own
    // effect: the window answers Magician of Faith on the chain, which would hide that.
    expect(offered!.kind).toBe('chain');
    if (offered!.kind !== 'chain') return;
    expect(offered!.quiet).toBeFalsy();
    const trigger = offered!.options.find((o) => o.id === offered!.trigger);
    expect(trigger?.code).toBe(BLS);
}));
