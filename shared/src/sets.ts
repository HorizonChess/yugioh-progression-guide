import type { Card, CardSet } from './types';

/**
 * The progression stops before the Link era. "Code of the Duelist" (COTD), the
 * first Link set, released Aug 4, 2017, so every set and printing is dated
 * against this cutoff.
 */
export const CUTOFF_DATE = '2017-08-01';

/** Side products kept out of the progression timeline to preserve the challenge. */
export const EXCLUDE_KEYWORDS = [
    "Structure Deck",
    "Starter Deck",
    "Tournament Pack",
    "Duelist Pack",
    "Battle Pack",
    "Star Pack",
    "Turbo Pack",
    "Astral Pack",
    "Champion Pack",
    "OTS Tournament Pack",
    "Premium Pack",
    "Movie Pack",
    "Super Starter",
    "Speed Duel",
    "Duel Terminal",
    "Legendary Decks",
    "Box Set",
    "Special Edition",
    "Magic Ruler", // Identical to Spell Ruler
] as const;

/**
 * The tournament-family sets the timeline filters OUT via EXCLUDE_KEYWORDS,
 * pulled back in for the "3 Tournament Packs" reward. Kept aligned with the
 * pack-logic tournament types (`determinePackType` / `generateTournamentPack`)
 * so the reward opens with the correct tournament ratios.
 */
export const TOURNAMENT_KEYWORDS = [
    "Tournament Pack",   // incl. "OTS Tournament Pack"
    "Champion Pack",
    "Turbo Pack",
    "Astral Pack",
] as const;

const byDate = (a: CardSet, b: CardSet) => new Date(a.tcg_date).getTime() - new Date(b.tcg_date).getTime();

/** True if `set` belongs on the progression timeline (dated, pre-cutoff, a real booster, not a side product). */
export function isTimelineSet(set: CardSet): boolean {
    if (!set.tcg_date) return false;
    if (set.tcg_date >= CUTOFF_DATE) return false;
    if (set.num_of_cards <= 20) return false;
    return !EXCLUDE_KEYWORDS.some(keyword => set.set_name.includes(keyword));
}

/** True if `set` is a pre-cutoff tournament-family pack (the "3 Tournament Packs" reward pool). */
export function isTournamentSet(set: CardSet): boolean {
    if (!set.tcg_date) return false;
    if (set.tcg_date >= CUTOFF_DATE) return false;
    return TOURNAMENT_KEYWORDS.some(keyword => set.set_name.includes(keyword));
}

/** The progression timeline: `currentSetIndex` is an index into this list. */
export function timelineSets(rawSets: readonly CardSet[]): CardSet[] {
    return rawSets.filter(isTimelineSet).sort(byDate);
}

/** The tournament-pack pool, ascending by date. */
export function tournamentSets(rawSets: readonly CardSet[]): CardSet[] {
    return rawSets.filter(isTournamentSet).sort(byDate);
}

/** set_name → tcg_date over the RAW (unfiltered) set list, for dating a card's printings. */
export function setDateMap(rawSets: readonly CardSet[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const set of rawSets) {
        if (set.tcg_date) map.set(set.set_name, set.tcg_date);
    }
    return map;
}

/**
 * True if `card` existed by the app's cutoff — i.e. it has at least one printing
 * (in ANY set: core booster, structure deck, tin, etc.) dated before CUTOFF_DATE.
 * This is a pure DATE test, not set-membership: a card printed only in a structure
 * deck still counts, matching how Starlight search reaches structure-deck cards.
 * Cards printed only after the cutoff (post-Link era) have no R2 art and aren't
 * part of the progression, so they must not be bannable. Undatable printings are
 * ignored; a card with no datable pre-cutoff printing is treated as too new.
 */
export function existedByCutoff(card: Card, setDates: Map<string, string>): boolean {
    return (card.card_sets ?? []).some((printing) => {
        const date = setDates.get(printing.set_name);
        return date != null && date < CUTOFF_DATE;
    });
}

/**
 * The earliest datable printing of `card` (across ALL set kinds), or null if none
 * of its printings can be dated via `setDates`. Used by the Starlight search to
 * gate a card to those with a printing released BEFORE the won pack — the same
 * pure-date rule as `existedByCutoff`, but against the pack's date rather than the
 * global cutoff, so Starlight can reach off-timeline (e.g. structure-deck) cards.
 */
export function earliestPrintingDate(card: Card, setDates: Map<string, string>): string | null {
    let earliest: string | null = null;
    for (const printing of card.card_sets ?? []) {
        const date = setDates.get(printing.set_name);
        if (date != null && (earliest == null || date < earliest)) earliest = date;
    }
    return earliest;
}
