import data from './card-versions.json';

/** An older version of a card: how it read and worked until `until` (null: through the whole timeline). */
export interface CardVersion {
    name: string;
    kind: 'goat' | 'pre-errata';
    /** The engine's passcode for this version. */
    code: number;
    /** The engine's passcode for the card itself. */
    base: number;
    until: string | null;
    text: string;
    source: string;
}

const VERSIONS = data as CardVersion[];
const BY_NAME = new Map<string, CardVersion[]>();
for (const v of VERSIONS) BY_NAME.set(v.name, [...(BY_NAME.get(v.name) ?? []), v]);

/**
 * The version of the card named `name` in play at `date` (a set's release date), or null for
 * today's card. The original (pre-errata) text comes first; then, in 2005 and before, the GOAT one.
 */
export function cardVersionAt(name: string, date: string | null | undefined): CardVersion | null {
    if (!date) return null;
    const list = BY_NAME.get(name);
    if (!list) return null;
    const live = (v: CardVersion) => v.until === null || date < v.until;
    return list.find((v) => v.kind === 'pre-errata' && live(v)) ?? list.find((v) => v.kind === 'goat' && live(v)) ?? null;
}

/** Functional errata that took effect after `from` and by `to` (two sets' dates): what changes as the series moves on. */
export function errataBetween(from: string | null | undefined, to: string | null | undefined): CardVersion[] {
    if (!from || !to) return [];
    const seen = new Set<string>();
    return VERSIONS.filter((v) => v.kind === 'pre-errata' && v.until !== null && v.until > from && v.until <= to && !seen.has(v.name) && seen.add(v.name));
}
