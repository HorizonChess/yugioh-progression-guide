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
export interface WheelPrize {
    /** Stable id — safe to key React lists / persist a claimed prize by. */
    id: string;
    /** Full player-facing label shown on the reveal. */
    label: string;
    /** Short label for the wheel face (kept distinct across similar prizes). */
    short: string;
}

export const WHEEL_PRIZES: WheelPrize[] = [
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
];
