import { isRarityAtOrBelow, wildcardRarityFloor, type PrizeId } from './rewards';
import type { Card, CardSet } from './types';

/*
 * What a reward choice grants, decided the same way by the server and by guest
 * play in the browser.
 */

export const REWARD_PACKS = 3;

export interface Grant {
    setCode: string;
    rarity: string;
}

const SHORT_PRINTS = new Set(['Short Print', 'Super Short Print', 'SP']);

/** A wildcard grants a card from the won set, at or below its rarity. */
export function wildcardGrant(card: Card, set: CardSet, prizeId: PrizeId): Grant | null {
    const ceiling = wildcardRarityFloor(prizeId);
    const rarity = (card.card_sets ?? [])
        .filter((p) => p.set_name === set.set_name)
        .map((p) => (SHORT_PRINTS.has(p.set_rarity) ? 'Common' : p.set_rarity))
        .find((r) => isRarityAtOrBelow(r, ceiling));
    return rarity ? { setCode: set.set_code, rarity } : null;
}

/** A starlight grants any card printed up to and including the won set, keyed by its earliest such printing. */
export function starlightGrant(card: Card, anchorDate: string, setDates: ReadonlyMap<string, string>): Grant | null {
    let best: { date: string; code: string } | null = null;
    for (const p of card.card_sets ?? []) {
        const date = setDates.get(p.set_name);
        if (date !== undefined && date <= anchorDate && (!best || date < best.date)) best = { date, code: p.set_code };
    }
    return best ? { setCode: best.code, rarity: 'Starlight Rare' } : null;
}

/** Tournament packs come from the latest tournament set released before the won set. */
export function tournamentSetFor(pool: readonly CardSet[], anchorDate: string): CardSet | undefined {
    const before = pool.filter((s) => s.tcg_date < anchorDate);
    return (before.length ? before : pool).at(-1);
}
