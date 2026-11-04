/*
 * Game rules shared by the server (which enforces them) and the browser (which
 * uses them to grey out what the server would refuse). The server is the
 * authority; these functions only decide, they never change state.
 */

/** How many booster packs each player opens per set, chosen when a series is created. */
export const PACKS_PER_SET_OPTIONS = [12, 24, 30] as const;
export type PacksPerSet = (typeof PACKS_PER_SET_OPTIONS)[number];

export const DEFAULT_PACKS_PER_SET: PacksPerSet = 24;

export function isPacksPerSet(value: unknown): value is PacksPerSet {
    return PACKS_PER_SET_OPTIONS.includes(value as PacksPerSet);
}

export interface SeriesRules {
    /** Index into the timeline (`timelineSets`) where the series begins. */
    startSetIndex: number;
    packsPerSet: PacksPerSet;
}

/**
 * Why these creation rules can't be used with a timeline of `setCount` sets,
 * or null if they're fine.
 */
export function seriesRulesProblem(rules: SeriesRules, setCount: number): string | null {
    if (!Number.isInteger(rules.startSetIndex) || rules.startSetIndex < 0) return 'The starting set must be a set on the timeline';
    if (rules.startSetIndex >= setCount) return 'The starting set must be a set on the timeline';
    if (!isPacksPerSet(rules.packsPerSet)) return `Packs per set must be one of ${PACKS_PER_SET_OPTIONS.join(', ')}`;
    return null;
}

export type OpenPacksBlock =
    /** The set index isn't on the timeline. */
    | 'unknown-set'
    /** Only the series' current set can be opened; earlier sets come only through rewards. */
    | 'not-current-set'
    /** This player already opened (or saved) their packs for this set. */
    | 'already-opened';

/**
 * Whether a player may open the regular packs of `setIndex` right now, or the
 * reason they may not. One opening per player per set; a Redoer Ticket rerolls
 * an opening, it doesn't grant a second one.
 */
export function openPacksBlock(input: {
    setIndex: number;
    currentSetIndex: number;
    setCount: number;
    alreadyOpened: boolean;
}): OpenPacksBlock | null {
    const { setIndex, currentSetIndex, setCount, alreadyOpened } = input;
    if (!Number.isInteger(setIndex) || setIndex < 0 || setIndex >= setCount) return 'unknown-set';
    if (setIndex !== currentSetIndex) return 'not-current-set';
    if (alreadyOpened) return 'already-opened';
    return null;
}
