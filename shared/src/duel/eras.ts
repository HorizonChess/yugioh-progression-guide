/**
 * The TCG rules a duel is played under, by the date of the set the series is on.
 * Dates are when each change took effect in the TCG (not the OCG), from Yugipedia:
 *   - Master Rule, Priority and Draw Phase pages (read 7 November 2026).
 * Each era maps to one of EDOPro's duel modes, whose flags do exactly these things:
 *   MR1: first player draws on turn 1, Ignition Effect priority, one Field Spell on the whole field.
 *   MR2: as MR1 without Ignition Effect priority.
 *   MR3: no draw for the first player on turn 1, each player keeps their own Field Spell, Pendulum Zones.
 *   MR4: Extra Monster Zones (Link era).
 * The engine's card scripts follow today's card text and errata in every era.
 */

export type DuelModeId = 'MR1' | 'MR2' | 'MR3' | 'MR4';

export interface RuleEra {
    id: DuelModeId;
    /** First TCG day of these rules (YYYY-MM-DD). A set released on or after it is played under them. */
    from: string;
    name: string;
    /** What changed from the era before, in a few words each (the first era lists its own rules). */
    changes: string[];
}

export const RULE_ERAS: readonly RuleEra[] = [
    {
        id: 'MR1',
        from: '2002-01-01',
        name: 'the original rules',
        changes: [
            'The player who goes first draws on their first turn',
            "A monster's Ignition Effect can be activated right after its Summon, before the opponent responds",
            'Only one face-up Field Spell on the whole field: a new one replaces it',
        ],
    },
    {
        id: 'MR2',
        // Ignition Effect priority removed in the TCG on April 25, 2012 (Priority page).
        from: '2012-04-25',
        name: 'Master Rule 2',
        changes: ["Ignition Effects no longer get priority after a Summon: the opponent can respond to the Summon first"],
    },
    {
        id: 'MR3',
        // Master Rule 3 in the TCG from July 10, 2014 (Draw Phase page).
        from: '2014-07-10',
        name: 'Master Rule 3',
        changes: [
            'The player who goes first no longer draws on their first turn',
            'Each player can keep their own face-up Field Spell',
            'Pendulum Zones join the field',
        ],
    },
    {
        id: 'MR4',
        // New Master Rule in the TCG with Starter Deck: Link Strike, July 20, 2017 (Master Rule page).
        from: '2017-07-20',
        name: 'New Master Rule',
        changes: [
            'Extra Deck monsters are Summoned to an Extra Monster Zone, or a zone a Link Monster points to',
            'Pendulum Zones move into the outermost Spell & Trap Zones',
        ],
    },
];

/** The rules for a set released on `date` (YYYY-MM-DD). */
export function ruleEraFor(date: string | undefined | null): RuleEra {
    let era = RULE_ERAS[0]!;
    if (!date) return era;
    for (const e of RULE_ERAS) if (date >= e.from) era = e;
    return era;
}

/** The era a set starts, if its rules differ from the set before it (`previousDate`); null when nothing changed. */
export function ruleChangeAt(date: string | undefined | null, previousDate: string | undefined | null): RuleEra | null {
    if (!date || !previousDate) return null;
    const now = ruleEraFor(date);
    return now.id !== ruleEraFor(previousDate).id ? now : null;
}
