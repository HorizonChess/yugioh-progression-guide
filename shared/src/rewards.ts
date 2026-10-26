/**
 * Shared Winner's Wheel prize list.
 *
 * Single source of truth for the wheel prizes, imported by BOTH the in-place
 * Winner's Wheel modal (shown after a win on the record-match screen) and the
 * standalone /rewards page. Keeping one list here removes the duplication risk
 * without changing /rewards' behavior. When Rewards becomes a real ledger tab,
 * prize resolution (granting wildcards/packs, ban/unban, snatch steal) grows
 * from here.
 */
interface PrizeDef {
    /** Stable id — safe to key React lists / persist a claimed prize by. */
    id: string;
    /** Full player-facing label shown on the reveal. */
    label: string;
    /** Short label for the wheel face (kept distinct across similar prizes). */
    short: string;
}

export const WHEEL_PRIZES = [
    { id: "wildcard-common", label: "Wildcard (Common)", short: "Common" },
    { id: "wildcard-rare", label: "Wildcard (Rare)", short: "Rare" },
    { id: "wildcard-super", label: "Wildcard (Super Rare)", short: "Super Rare" },
    { id: "wildcard-ultra", label: "Wildcard (Ultra Rare)", short: "Ultra Rare" },
    { id: "wildcard-ultimate-secret", label: "Wildcard (Ultimate/Secret Rare)", short: "Ult / Secret" },
    { id: "wildcard-starlight", label: "Wildcard (Starlight Rare)", short: "Starlight" },
    { id: "tournament-packs", label: "3 Tournament Packs", short: "3 Tourn. Packs" },
    { id: "ban", label: "Ban a Card", short: "Ban" },
    { id: "unban", label: "Unban a Card", short: "Unban" },
    { id: "snatch-steal", label: "Snatch Steal", short: "Snatch Steal" },
] as const satisfies readonly PrizeDef[];

/**
 * The Defeat (loss) reward. NOT a wheel prize — the wheel is win-only — so it's
 * kept out of WHEEL_PRIZES and referenced by this id when a match is lost. Its
 * claim flow opens 3 boosters of the just-finished CORE set (distinct from the
 * `tournament-packs` prize, which opens 3 real Tournament packs).
 */
export const PITY_PRIZE = {
    id: "pity-packs",
    label: "3 Pity Packs",
    short: "Pity Packs",
} as const satisfies PrizeDef;

/** Every prize a reward can carry: the wheel prizes plus the pity prize. */
export type PrizeId = (typeof WHEEL_PRIZES)[number]["id"] | typeof PITY_PRIZE.id;

export interface WheelPrize extends PrizeDef {
    id: PrizeId;
}

const ALL_PRIZES: readonly WheelPrize[] = [...WHEEL_PRIZES, PITY_PRIZE];

export function isPrizeId(value: unknown): value is PrizeId {
    return ALL_PRIZES.some((p) => p.id === value);
}

/** Look up a prize descriptor by id across the wheel prizes + the pity prize. */
export function getPrize(prizeId: PrizeId): WheelPrize | undefined {
    return ALL_PRIZES.find((p) => p.id === prizeId);
}

// --- Rewards ledger --------------------------------------------------------

export type RewardStatus = "available" | "claimed";

/**
 * A single reward in a save's persisted ledger. Created "available" when a
 * match outcome is claimed (win → the wheel prize; loss → the pity prize) and
 * flipped to "claimed" once its per-type flow resolves. The `wonFrom*` anchors
 * let the complex flows reference the pack the reward came from — the wildcard
 * modal shows that pack's details, and the "released prior to this pack" gates
 * (starlight / tournament) compare against `sets[wonFromSetIndex].tcg_date`.
 */
export interface RewardEntry {
    /** Stable id — React key + ledger identity. */
    id: string;
    /** WheelPrize.id (or PITY_PRIZE.id) — the prize kind. */
    prizeId: PrizeId;
    /** CardSet.set_name recorded on the match this reward was won from. */
    wonFromPackName: string;
    /** currentSetIndex at time of win — anchor for the date gates. */
    wonFromSetIndex: number;
    /** ISO timestamp of when the reward was won. */
    wonDate: string;
    status: RewardStatus;
    /** ISO timestamp set when the reward is claimed. */
    claimedDate?: string;

    // Per-type payload — only the field relevant to the prize is set on claim.
    /** wildcard / starlight — the single granted card. */
    grantedCardId?: number;
    /** tournament-packs / pity — the opened pack contents. */
    grantedCardIds?: number[];
    /** ban / unban — the affected card. */
    bannedCardId?: number;
}

/** The claim flow a prize routes to in the Rewards ledger UI. */
export type PrizeKind =
    | "wildcard"
    | "starlight"
    | "tournament"
    | "pity"
    | "ban"
    | "unban"
    | "snatch";

const PRIZE_KIND: Record<PrizeId, PrizeKind> = {
    "wildcard-common": "wildcard",
    "wildcard-rare": "wildcard",
    "wildcard-super": "wildcard",
    "wildcard-ultra": "wildcard",
    "wildcard-ultimate-secret": "wildcard",
    "wildcard-starlight": "starlight",
    "tournament-packs": "tournament",
    "pity-packs": "pity",
    ban: "ban",
    unban: "unban",
    "snatch-steal": "snatch",
};

/** Map a prizeId to the claim flow that resolves it. */
export function resolvePrizeKind(prizeId: PrizeId): PrizeKind {
    return PRIZE_KIND[prizeId];
}

/**
 * The single card a claimed reward resolved to (for the ledger's claimed view),
 * or null for rewards without one pick — pack rewards (pity/tournament open 3
 * packs, shown as a count instead). Ban/unban surface the
 * affected card; wildcard/starlight/snatch surface the granted/stolen card.
 */
export function claimedCardId(entry: RewardEntry): number | null {
    switch (resolvePrizeKind(entry.prizeId)) {
        case "wildcard":
        case "starlight":
        case "snatch":
            return entry.grantedCardId ?? null;
        case "ban":
        case "unban":
            return entry.bannedCardId ?? null;
        default:
            return null; // pity / tournament (grantedCardIds)
    }
}

/** Short caption shown under a claimed reward's picked card, by prize kind. */
export function claimedCardCaption(entry: RewardEntry): string {
    switch (resolvePrizeKind(entry.prizeId)) {
        case "ban":
            return "Banned";
        case "unban":
            return "Unbanned";
        case "snatch":
            return "Snatched";
        default:
            return "Added to collection"; // wildcard / starlight
    }
}

/**
 * Ascending rarity ladder for wildcards, low → high. A wildcard grants any card
 * of its rarity OR BELOW, so `wildcardRarityFloor` returns the prize's ceiling
 * and `isRarityAtOrBelow` tests a card's rarity against it. Uses the canonical
 * set_rarity labels the API returns (see lib/utils.ts RARITY_ORDER); "Ultimate
 * Rare" and "Secret Rare" share the ultimate/secret tier.
 */
const WILDCARD_RARITY_LADDER: readonly string[] = [
    "Common",
    "Rare",
    "Super Rare",
    "Ultra Rare",
    "Ultimate Rare",
    "Secret Rare",
    "Starlight Rare",
] as const;

const WILDCARD_CEILING: Partial<Record<PrizeId, string>> = {
    "wildcard-common": "Common",
    "wildcard-rare": "Rare",
    "wildcard-super": "Super Rare",
    "wildcard-ultra": "Ultra Rare",
    // The ultimate/secret tier — treat Secret Rare as the ceiling (Ultimate sits
    // just under it on the ladder, so "or below" naturally includes it).
    "wildcard-ultimate-secret": "Secret Rare",
    "wildcard-starlight": "Starlight Rare",
};

/** The highest rarity a wildcard prize may grant, e.g. "wildcard-super" → "Super Rare". */
export function wildcardRarityFloor(prizeId: PrizeId): string {
    return WILDCARD_CEILING[prizeId] ?? "Common";
}

/** True if `rarity` is at or below `ceiling` on the wildcard ladder (unknown rarities excluded). */
export function isRarityAtOrBelow(rarity: string, ceiling: string): boolean {
    const r = WILDCARD_RARITY_LADDER.indexOf(rarity);
    const c = WILDCARD_RARITY_LADDER.indexOf(ceiling);
    if (r === -1 || c === -1) return false;
    return r <= c;
}
