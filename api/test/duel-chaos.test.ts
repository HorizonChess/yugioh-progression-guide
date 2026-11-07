import { expect, it } from 'vitest';
import type { DuelAnswer, DuelPrompt } from '@ygo/shared';
import { engineDataAvailable, loadEngine } from '../src/duel/engine';
import { DuelSession } from '../src/duel/session';

const POOL: Record<string, number> = {
    Scapegoat: 73915052, FiendsSanctuary: 24874630, OjamaTrio: 29843091, MonsterReborn: 83764718, ChangeOfHeart: 4031928,
    PotOfGreed: 55144522, DarkHole: 53129443, Raigeki: 12580477, Swords: 72302403, MirrorForce: 44095762, TrapHole: 4206964,
    Waboku: 12607053, Reinforcements: 17814387, Polymerization: 24094653, FlameManipulator: 34460851, Masaki: 44287299,
    BlackLusterRitual: 55761792, BLS: 5405694, TimeWizard: 71625222, ManEaterBug: 54652250, Witch: 78010363, Sangan: 26202165,
    MysticTomato: 83011277, CyberJar: 34124316, MorphingJar: 33508719, CardDestruction: 72892473, GracefulDice: 74137509,
    MagicCylinder: 62279055, RingOfDestruction: 83555666, ExiledForce: 74131780, RoyalOppression: 93016201, BlastWithChain: 98239899,
    Bottomless: 29401950, Lily: 79575620, Jinzo: 77585513, SevenColoredFish: 23771716, BookOfMoon: 14087893, SnatchSteal: 45986603,
    PrematureBurial: 70828912, Nobleman: 71044499, CostDown: 23265313, Messenger: 44656491, MagicalHats: 81210420, Kuriboh: 40640057,
    Sakuretsu: 56120475, RobbinGoblin: 88279736, DragonCaptureJar: 50045299, TributeToTheDoomed: 79759861, Exodia: 33396948,
    CallOfTheHaunted: 97077563, Upstart: 70368879, MysticalSpaceTyphoon: 5318639, Confiscation: 17375316,
    DelinquentDuo: 44763025, MagicJammer: 77414722, SolemnJudgment: 41420027, TheForcefulSentry: 42829885, Thunder: 76184692,
    CelticGuardian: 91152256, Gemini: 83994646, Fusion1: 45231177,
};
const EXTRA = [45231177, 45231177, 45231177];

function rng(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomAnswer(p: DuelPrompt, r: () => number, attempt: number): DuelAnswer {
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
    const subset = (n: number, min: number, max: number) => {
        const k = Math.min(n, min + Math.floor(r() * (Math.min(max, n) - min + 1)));
        const ids = [...Array(n).keys()].sort(() => r() - 0.5);
        return ids.slice(0, Math.max(k, min));
    };
    switch (p.kind) {
        case 'actions': {
            const all = [...p.actions.map((a) => a.id), ...p.next.map((n) => n.id)];
            // Mostly do things; sometimes move on.
            const doIt = p.actions.length && r() < 0.8;
            return { kind: 'choice', id: doIt ? pick(p.actions).id : pick(p.next.length ? p.next.map((n) => n.id) : all) };
        }
        case 'chain': return { kind: 'choice', id: p.options.length && (r() < 0.6 || p.pass === null) ? pick(p.options).id : p.pass! };
        case 'cards':
            if (p.cancel && r() < 0.05) return { kind: 'cancel' };
            if (p.step) return p.step.canFinish && (r() < 0.5 || !p.cards.length) ? { kind: 'done' } : { kind: 'choice', id: pick(p.cards).id };
            return { kind: 'many', ids: subset(p.cards.length, p.min, p.max).map((i) => p.cards[i]!.id) };
        case 'place': return { kind: 'many', ids: subset(p.zones.length, p.count, p.count).map((i) => p.zones[i]!.id) };
        case 'yesno': return { kind: 'choice', id: r() < 0.5 ? 1 : 0 };
        case 'option': case 'number': case 'position': return { kind: 'choice', id: pick(p.options as { id: number }[]).id };
        case 'declare': return { kind: 'many', ids: subset(p.options.length, p.count, p.count).map((i) => p.options[i]!.id) };
        case 'card-name': return { kind: 'name', name: attempt > 2 ? 'Dark Magician' : pick(['Dark Magician', 'Pot of Greed', 'Mirror Force']) };
    }
}

/*
 * Whole duels with the cards most likely to trip the interface (tokens, fusion and ritual summons,
 * coins and dice, flips, control changes, discards, negation), every question answered at random
 * through the prompts a player sees: nothing may get stuck, and every replay lands where the duel is.
 * GAMES=200 for a longer run.
 */
it.skipIf(!engineDataAvailable())('plays tricky cards through the prompts without getting stuck', async () => {
    const engine = await loadEngine();
    const codes = Object.values(POOL).filter((c) => engine.cardData(c));
    const missing = Object.entries(POOL).filter(([, c]) => !engine.cardData(c)).map(([n]) => n);
    if (missing.length) console.log('not in the engine:', missing.join(', '));
    const kinds = new Map<string, number>();
    const problems: string[] = [];
    const tokens = new Set<string>();
    for (let game = 0; game < Number(process.env.GAMES ?? 12); game++) {
        const r = rng(game * 7919 + 1);
        const deck = () => Array.from({ length: 40 }, () => codes[Math.floor(r() * codes.length)]!);
        const duel = new DuelSession(engine, { seed: [String(game + 1), '11400714819323198485', String(game * 13 + 7), '2685821657736338717'], mode: 'MR1', decks: [{ main: deck(), extra: EXTRA }, { main: deck(), extra: EXTRA }], names: ['A', 'B'], bots: [false, false], rules: 2 });
        try {
            duel.start();
            let stuck = 0, steps = 0;
            for (; steps < 1500 && !duel.result; steps++) {
                const team = duel.waitingFor();
                if (team === null) { problems.push(`game ${game}: nobody to answer at step ${steps}`); break; }
                const s = duel.state(team, 'd');
                JSON.stringify(s);
                if (!s.prompt) { problems.push(`game ${game}: no prompt`); break; }
                kinds.set(s.prompt.kind, (kinds.get(s.prompt.kind) ?? 0) + 1);
                // Every card on the board is a card the page can show.
                for (const side of [s.view.me, s.view.opp]) for (const c of [...side.monsters, ...side.spells]) {
                    if (c && c.faceUp && !engine.cardData(c.code)) problems.push(`game ${game}: unknown face-up card ${c.code}`);
                    // A token comes with its name (the page's card catalog has no tokens).
                    if (c && c.faceUp && engine.isToken(c.code)) {
                        tokens.add(c.token ?? '');
                        if (!c.token) problems.push(`game ${game}: token ${c.code} without its name`);
                    }
                }
                const ok = duel.answer(team, s.seq, randomAnswer(s.prompt, r, stuck));
                if (!ok || duel.state(team, 'd').retry) {
                    if (++stuck > 25) { problems.push(`game ${game}: stuck on ${JSON.stringify(s.prompt).slice(0, 400)}`); break; }
                } else stuck = 0;
            }
            // And a replay lands exactly where the duel is.
            const again = new DuelSession(engine, duel.setup);
            again.start(duel.answers);
            expect(again.state(0, 'd').view).toEqual(duel.state(0, 'd').view);
        } catch (e) {
            problems.push(`game ${game}: ${(e as Error).message}`);
        }
    }
    console.log('questions seen:', JSON.stringify(Object.fromEntries(kinds)), 'tokens:', [...tokens].join(', '));
    expect(tokens.size).toBeGreaterThan(0);
    console.log(problems.slice(0, 30).join('\n'));
    expect(problems).toEqual([]);
}, 300_000);
