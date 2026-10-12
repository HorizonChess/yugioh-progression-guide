import { Card, CardSet, PulledCard } from './api';

/**
 * Booster Pack Logic
 *
 * This module implements pack opening simulation based on documented rarity ratios.
 * See: src/data/pack_opening_rules.md for detailed ratio documentation.
 *
 * Key concepts:
 * - "Hat" method: We use LCM of ratios to create a probability distribution
 * - Era-based configs: Different eras have different rarity ratios
 * - Short prints are treated as their declared rarity (no special ratio)
 */

export interface PackResult {
    cards: PulledCard[];
}

// Rarity Definitions
const RARITIES = ['Common', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare', 'Ultimate Rare', 'Ghost Rare', 'Starlight Rare', 'Short Print'] as const;
type Rarity = (typeof RARITIES)[number];

// Rarity hierarchy for fallback logic (most rare to least rare)
const RARITY_HIERARCHY: readonly string[] = [
    'Starlight Rare', 'Ghost Rare', 'Secret Rare', 'Ultimate Rare',
    'Ultra Rare', 'Super Rare', 'Rare', 'Common'
] as const;

/**
 * Era Definitions for Core Sets
 * See: pack_opening_rules.md "Pack Ratios Per Set" -> "Core Sets"
 */
enum Era {
    PreSoulOfTheDuelist,                  // LOB -> AST: Super 1:6, Ultra 1:12, Secret 1:31
    SoulOfTheDuelistToCyberdark,          // SOD -> CDIP: Super 1:6, Ultra 1:24, Ultimate 1:12
    StrikeOfNeosToForceOfTheBreaker,      // STON -> FOTB: Added Secret 1:31 back
    TacticalEvolutionToAbsolutePowerforce, // TAEV -> ABPF: First Ghost Rares (1:288)
    ShiningDarknessToDimensionOfChaos,    // TSHD -> DOCS: Improved Secret/Ultimate to 1:23
    BreakersOfShadowToDarkNeostorm,       // BOSH -> DANE: Guaranteed foil, no Ghost
    RisingRampageToIgnitionAssault,       // RIRA -> IGAS: Added Starlight 1:576
    EternityCodeToPresent,                // ETCO+: Rares discontinued, 8 commons
}

/**
 * Pack Type Definitions
 * See: pack_opening_rules.md for each pack type's rules
 */
enum PackType {
    Core,        // Main booster sets: 9 cards (7 commons, 1 rare, 1 foil slot)
    Tournament,  // TP, CP, TU, AP, OTS: 3 cards (2 commons, 1 variable)
    Duelist,     // Duelist Packs: 5 cards (3 commons, 1 rare, 1 foil slot)
    Reprint,     // Dark Beginning/Revelation: 12 cards; Retro Pack: 9 cards
    PremiumGold, // 5 cards (2 Gold Secrets, 3 Gold Rares with card range rules)
    Other        // Fallback for unknown pack types
}

// Configuration for an Era/Pack Type
interface PackConfig {
    cardsPerPack: number;
    guaranteedCommons: number;
    guaranteedRare: boolean; // If true, one slot is guaranteed Rare (unless upgraded in some eras)
    foilSlot: boolean; // If true, has a dedicated slot that can be foil or common (or guaranteed foil)
    foilIsGuaranteed: boolean; // If true, the foil slot is ALWAYS foil (BOSH+)
    ratios: Partial<Record<Rarity, number>>; // 1 in X chance. e.g. { 'Ultra Rare': 12 } means 1:12
    ultimateCanBeUpgrade: boolean; // If true, Ultimate Rare can replace Rare/Super/Ultra (Hobby box logic)
}

export function generateBoosterPack(setCards: Card[], setInfo: CardSet): PulledCard[] {
    const packType = determinePackType(setInfo);

    if (packType === PackType.Core) {
        return generateCorePack(setCards, setInfo);
    } else if (packType === PackType.Tournament) {
        return generateTournamentPack(setCards, setInfo);
    } else if (packType === PackType.Duelist) {
        return generateDuelistPack(setCards, setInfo);
    } else if (packType === PackType.Reprint) {
        return generateReprintPack(setCards, setInfo);
    } else if (packType === PackType.PremiumGold) {
        return generatePremiumGoldPack(setCards, setInfo);
    } else {
        // Fallback to simple logic for unknown types
        return generateSimplePack(setCards, setInfo);
    }
}

// --- Pack Type Determination ---

function determinePackType(set: CardSet): PackType {
    const name = set.set_name.toLowerCase();
    // const code = set.set_code.toUpperCase(); // Unused

    if (name.includes('tournament pack') || name.includes('champion pack') || name.includes('turbo pack') || name.includes('astral pack') || name.includes('ots tournament pack')) {
        return PackType.Tournament;
    }
    if (name.includes('duelist pack')) {
        return PackType.Duelist;
    }
    if (name.includes('dark beginning') || name.includes('dark revelation') || name.includes('dark legends') || name.includes('retro pack')) {
        return PackType.Reprint;
    }
    if (name.includes('premium gold')) {
        return PackType.PremiumGold;
    }

    // Default to Core for main sets
    return PackType.Core;
}

// --- Core Pack Logic ---
// See: pack_opening_rules.md "Core Sets" section

function generateCorePack(setCards: Card[], setInfo: CardSet): PulledCard[] {
    const era = determineCoreEra(setInfo);
    const config = getCoreEraConfig(era);

    return generatePackFromConfig(setCards, setInfo, config);
}

function determineCoreEra(set: CardSet): Era {
    const date = set.tcg_date;

    // Helper to compare dates
    const isBefore = (d: string) => date < d;
    // const isAfterOrEq = (d: string) => date >= d; // Unused

    // Dates of boundary sets (approximate TCG release dates)
    const SOD_DATE = '2004-10-01';
    const STON_DATE = '2007-02-28';
    const TAEV_DATE = '2007-08-15';
    const TSHD_DATE = '2010-05-11';
    const BOSH_DATE = '2016-01-15';
    const RIRA_DATE = '2019-07-26';
    const ETCO_DATE = '2020-06-05'; // NA Date

    if (isBefore(SOD_DATE)) return Era.PreSoulOfTheDuelist;
    if (isBefore(STON_DATE)) return Era.SoulOfTheDuelistToCyberdark;
    if (isBefore(TAEV_DATE)) return Era.StrikeOfNeosToForceOfTheBreaker;
    if (isBefore(TSHD_DATE)) return Era.TacticalEvolutionToAbsolutePowerforce;
    if (isBefore(BOSH_DATE)) return Era.ShiningDarknessToDimensionOfChaos;
    if (isBefore(RIRA_DATE)) return Era.BreakersOfShadowToDarkNeostorm;
    if (isBefore(ETCO_DATE)) return Era.RisingRampageToIgnitionAssault;
    return Era.EternityCodeToPresent;
}

/**
 * Returns pack configuration for each core set era.
 * Ratios sourced from pack_opening_rules.md "Core Sets" section.
 */
function getCoreEraConfig(era: Era): PackConfig {
    switch (era) {
        // Pre Soul of the Duelist (LOB -> AST)
        // Ratios: Super 1:6, Ultra 1:12, Secret 1:31
        case Era.PreSoulOfTheDuelist:
            return {
                cardsPerPack: 9,
                guaranteedCommons: 7,
                guaranteedRare: true,
                foilSlot: true,
                foilIsGuaranteed: false,
                ratios: { 'Super Rare': 6, 'Ultra Rare': 12, 'Secret Rare': 31 },
                ultimateCanBeUpgrade: false
            };

        // Soul of the Duelist through Cyberdark Impact (SOD -> CDIP)
        // Ultimate chance is 2x Ultra chance (per Ruxin34)
        // Ratios: Super 1:6, Ultra 1:24, Ultimate 1:12
        case Era.SoulOfTheDuelistToCyberdark:
            return {
                cardsPerPack: 9,
                guaranteedCommons: 7,
                guaranteedRare: true,
                foilSlot: true,
                foilIsGuaranteed: false,
                ratios: { 'Super Rare': 6, 'Ultra Rare': 24, 'Ultimate Rare': 12 },
                ultimateCanBeUpgrade: true
            };

        // Strike of Neos and Force of the Breaker (STON -> FOTB)
        // Same as previous + Secret Rares added back
        // Ratios: Super 1:6, Ultra 1:24, Secret 1:31, Ultimate 1:12
        case Era.StrikeOfNeosToForceOfTheBreaker:
            return {
                cardsPerPack: 9,
                guaranteedCommons: 7,
                guaranteedRare: true,
                foilSlot: true,
                foilIsGuaranteed: false,
                ratios: { 'Super Rare': 6, 'Ultra Rare': 24, 'Secret Rare': 31, 'Ultimate Rare': 12 },
                ultimateCanBeUpgrade: true
            };

        // Tactical Evolution through Absolute Powerforce (TAEV -> ABPF)
        // First sets with Ghost Rares (1:288 per Konami blog)
        // Ratios: Super 1:5, Ultra 1:12, Secret 1:31, Ultimate 1:31, Ghost 1:288
        case Era.TacticalEvolutionToAbsolutePowerforce:
            return {
                cardsPerPack: 9,
                guaranteedCommons: 7,
                guaranteedRare: true,
                foilSlot: true,
                foilIsGuaranteed: false,
                ratios: { 'Super Rare': 5, 'Ultra Rare': 12, 'Secret Rare': 31, 'Ultimate Rare': 31, 'Ghost Rare': 288 },
                ultimateCanBeUpgrade: true
            };

        // Shining Darkness through Dimension of Chaos (TSHD -> DOCS)
        // Improved Secret/Ultimate odds to 1-2 per box
        // Ratios: Super 1:5, Ultra 1:12, Secret 1:23, Ultimate 1:23, Ghost 1:288
        case Era.ShiningDarknessToDimensionOfChaos:
            return {
                cardsPerPack: 9,
                guaranteedCommons: 7,
                guaranteedRare: true,
                foilSlot: true,
                foilIsGuaranteed: false,
                ratios: { 'Super Rare': 5, 'Ultra Rare': 12, 'Secret Rare': 23, 'Ultimate Rare': 23, 'Ghost Rare': 288 },
                ultimateCanBeUpgrade: true
            };

        // Breakers of Shadow through Dark Neostorm (BOSH -> DANE)
        // Major change: 9th card guaranteed foil (Super/Ultra/Secret). Ghost removed.
        // Ratios: Ultra 1:6, Secret 1:12 (Super is fallback)
        case Era.BreakersOfShadowToDarkNeostorm:
            return {
                cardsPerPack: 9,
                guaranteedCommons: 7,
                guaranteedRare: true,
                foilSlot: true,
                foilIsGuaranteed: true,
                ratios: { 'Ultra Rare': 6, 'Secret Rare': 12 },
                ultimateCanBeUpgrade: false
            };

        // Rising Rampage through Ignition Assault (RIRA -> IGAS)
        // Added Starlight Rares (1:576)
        // Ratios: Ultra 1:6, Secret 1:12, Starlight 1:576
        case Era.RisingRampageToIgnitionAssault:
            return {
                cardsPerPack: 9,
                guaranteedCommons: 7,
                guaranteedRare: true,
                foilSlot: true,
                foilIsGuaranteed: true,
                ratios: { 'Ultra Rare': 6, 'Secret Rare': 12, 'Starlight Rare': 576 },
                ultimateCanBeUpgrade: false
            };

        // Eternity Code to Present (ETCO+)
        // Rares discontinued - packs have 8 commons + 1 foil
        // Ratios: Ultra 1:6, Secret 1:12, Starlight 1:576
        case Era.EternityCodeToPresent:
            return {
                cardsPerPack: 9,
                guaranteedCommons: 8,
                guaranteedRare: false,
                foilSlot: true,
                foilIsGuaranteed: true,
                ratios: { 'Ultra Rare': 6, 'Secret Rare': 12, 'Starlight Rare': 576 },
                ultimateCanBeUpgrade: false
            };

        default:
            return {
                cardsPerPack: 9,
                guaranteedCommons: 7,
                guaranteedRare: true,
                foilSlot: true,
                foilIsGuaranteed: false,
                ratios: { 'Super Rare': 6, 'Ultra Rare': 12, 'Secret Rare': 31 },
                ultimateCanBeUpgrade: false
            };
    }
}

// --- Tournament Pack Logic ---
// See: pack_opening_rules.md "Tournament Pack Rewards" section
// All tournament packs: 3 cards (2 commons, 1 variable third card)

function generateTournamentPack(setCards: Card[], setInfo: CardSet): PulledCard[] {
    const name = setInfo.set_name.toLowerCase();
    let config: PackConfig;

    if (name.includes('tournament pack')) {
        // Tournament Packs: Third card can be common
        // Ratios: Rare 1:3, Super 1:18, Ultra 1:108
        config = {
            cardsPerPack: 3,
            guaranteedCommons: 2,
            guaranteedRare: false,
            foilSlot: true,
            foilIsGuaranteed: false,
            ratios: { 'Rare': 3, 'Super Rare': 18, 'Ultra Rare': 108 },
            ultimateCanBeUpgrade: false
        };
    } else if (name.includes('champion pack')) {
        // Champion Packs: No commons for third card, fallback is Rare
        // Ratios: Super 1:12, Ultra 1:48
        config = {
            cardsPerPack: 3,
            guaranteedCommons: 2,
            guaranteedRare: false,
            foilSlot: true,
            foilIsGuaranteed: true,
            ratios: { 'Super Rare': 12, 'Ultra Rare': 48 },
            ultimateCanBeUpgrade: false
        };
    } else if (name.includes('turbo pack')) {
        // Turbo Packs: Added Ultimate Rares
        // Ratios: Super 1:12, Ultra 1:32, Ultimate 1:32
        config = {
            cardsPerPack: 3,
            guaranteedCommons: 2,
            guaranteedRare: false,
            foilSlot: true,
            foilIsGuaranteed: true,
            ratios: { 'Super Rare': 12, 'Ultra Rare': 32, 'Ultimate Rare': 32 },
            ultimateCanBeUpgrade: false
        };
    } else {
        // Astral and OTS Packs: No rares exist, fallback is Super
        // Ratios: Ultimate 1:20 (per Ruxin34 pack openings)
        config = {
            cardsPerPack: 3,
            guaranteedCommons: 2,
            guaranteedRare: false,
            foilSlot: true,
            foilIsGuaranteed: true,
            ratios: { 'Ultimate Rare': 20 },
            ultimateCanBeUpgrade: false
        };
    }

    return generatePackFromConfig(setCards, setInfo, config, (name.includes('astral') || name.includes('ots')) ? 'Super Rare' : 'Rare');
}

// --- Duelist Pack Logic ---
// See: pack_opening_rules.md "Duelist Packs" section
// All duelist packs: 5 cards (3 commons, 1 rare, 1 foil slot)

function generateDuelistPack(setCards: Card[], setInfo: CardSet): PulledCard[] {
    const name = setInfo.set_name.toLowerCase();
    let config: PackConfig;

    if (name.includes('kaiba')) {
        // Duelist Pack Kaiba: Only duelist pack with Ultimate Rares
        // Ratios from official product list: Super 1:5, Ultra 1:15, Ultimate 1:24
        config = {
            cardsPerPack: 5,
            guaranteedCommons: 3,
            guaranteedRare: true,
            foilSlot: true,
            foilIsGuaranteed: false,
            ratios: { 'Super Rare': 5, 'Ultra Rare': 15, 'Ultimate Rare': 24 },
            ultimateCanBeUpgrade: false
        };
    } else if (name.includes('jaden') || name.includes('jesse') || name.includes('zane') || name.includes('aster') || name.includes('chazz') || name.includes('syrus')) {
        // Jaden Yuki 1 through Jesse Anderson era
        // Ratios: Super 1:6, Ultra 1:24
        config = {
            cardsPerPack: 5,
            guaranteedCommons: 3,
            guaranteedRare: true,
            foilSlot: true,
            foilIsGuaranteed: false,
            ratios: { 'Super Rare': 6, 'Ultra Rare': 24 },
            ultimateCanBeUpgrade: false
        };
    } else {
        // Yusei onwards and remaining duelist packs
        // Ratios: Super 1:5, Ultra 1:15
        config = {
            cardsPerPack: 5,
            guaranteedCommons: 3,
            guaranteedRare: true,
            foilSlot: true,
            foilIsGuaranteed: false,
            ratios: { 'Super Rare': 5, 'Ultra Rare': 15 },
            ultimateCanBeUpgrade: false
        };
    }

    return generatePackFromConfig(setCards, setInfo, config);
}

// --- Reprint Pack Logic ---
// See: pack_opening_rules.md "Reprint Packs" section
// Dark Beginning/Revelation/Legends: 12 cards (10 commons, 1 rare, 1 foil)
// Retro Pack: 9 cards (7 commons, 1 rare, 1 foil)

function generateReprintPack(setCards: Card[], setInfo: CardSet): PulledCard[] {
    const name = setInfo.set_name.toLowerCase();
    let config: PackConfig;

    if (name.includes('dark revelation volume 4')) {
        // Dark Revelation 4: Secret rare ratio defaulted to 1:31 (TAEV era)
        // Ratios: Super 1:4, Ultra 1:8, Secret 1:31
        config = {
            cardsPerPack: 12,
            guaranteedCommons: 10,
            guaranteedRare: true,
            foilSlot: true,
            foilIsGuaranteed: false,
            ratios: { 'Super Rare': 4, 'Ultra Rare': 8, 'Secret Rare': 31 },
            ultimateCanBeUpgrade: false
        };
    } else if (name.includes('dark legends')) {
        // Dark Legends: No secrets (Gorz is promo, not pullable)
        // Ratios: Super 1:5, Ultra 1:12
        config = {
            cardsPerPack: 12,
            guaranteedCommons: 10,
            guaranteedRare: true,
            foilSlot: true,
            foilIsGuaranteed: false,
            ratios: { 'Super Rare': 5, 'Ultra Rare': 12 },
            ultimateCanBeUpgrade: false
        };
    } else if (name.includes('retro pack')) {
        // Retro Pack 1 & 2: 9 cards (like core sets)
        // Secret ratio from core sets at their time
        // Ratios: Super 1:5, Ultra 1:12, Secret 1:31
        config = {
            cardsPerPack: 9,
            guaranteedCommons: 7,
            guaranteedRare: true,
            foilSlot: true,
            foilIsGuaranteed: false,
            ratios: { 'Super Rare': 5, 'Ultra Rare': 12, 'Secret Rare': 31 },
            ultimateCanBeUpgrade: false
        };
    } else {
        // Dark Beginning 1-2, Dark Revelation 1-3
        // Ratios: Super 1:6, Ultra 1:12
        config = {
            cardsPerPack: 12,
            guaranteedCommons: 10,
            guaranteedRare: true,
            foilSlot: true,
            foilIsGuaranteed: false,
            ratios: { 'Super Rare': 6, 'Ultra Rare': 12 },
            ultimateCanBeUpgrade: false
        };
    }

    return generatePackFromConfig(setCards, setInfo, config);
}

// --- Premium Gold Logic ---
// See: pack_opening_rules.md "Premium Gold Packs" section
// All Premium Gold: 5 cards (2 Gold Secrets, 3 Gold Rares)
// Each variant has specific card number ranges for gold rares

/**
 * Extracts the card number from a set code (e.g., "PGLD-EN033" -> 33)
 */
function getCardNumber(card: Card, setPrefix: string): number | null {
    if (!card.card_sets) return null;
    const setEntry = card.card_sets.find(s => s.set_code.startsWith(setPrefix));
    if (!setEntry) return null;

    // Extract number from set_code like "PGLD-EN033" -> 33
    const digits = setEntry.set_code.match(/(\d+)$/)?.[1];
    return digits ? parseInt(digits, 10) : null;
}

/**
 * Filters cards by card number range
 */
function filterByCardNumberRange(cards: Card[], setPrefix: string, min: number, max: number): Card[] {
    return cards.filter(c => {
        const num = getCardNumber(c, setPrefix);
        return num !== null && num >= min && num <= max;
    });
}

function generatePremiumGoldPack(setCards: Card[], setInfo: CardSet): PulledCard[] {
    const name = setInfo.set_name.toLowerCase();
    const setPrefix = setInfo.set_code;

    const goldSecrets = setCards.filter(c => isRarity(c, 'Gold Secret Rare', setPrefix));
    const allGoldRares = setCards.filter(c => isRarity(c, 'Gold Rare', setPrefix));

    const pack: PulledCard[] = [];

    // 2 Gold Secrets (same for all variants)
    for (let i = 0; i < 2; i++) {
        if (goldSecrets.length > 0) {
            pack.push(toPulledCard(pickRandom(goldSecrets), 'Gold Secret Rare', setPrefix));
        }
    }

    // 3 Gold Rares with variant-specific card number ranges
    if (name.includes('return of the bling')) {
        // Premium Gold: Return of the Bling
        // 1 gold rare from cards 70-91, 2 gold rares from cards 22-69
        const pool1 = filterByCardNumberRange(allGoldRares, setPrefix, 70, 91);
        const pool2 = filterByCardNumberRange(allGoldRares, setPrefix, 22, 69);

        if (pool1.length > 0) {
            pack.push(toPulledCard(pickRandom(pool1), 'Gold Rare', setPrefix));
        } else if (allGoldRares.length > 0) {
            pack.push(toPulledCard(pickRandom(allGoldRares), 'Gold Rare', setPrefix));
        }

        for (let i = 0; i < 2; i++) {
            if (pool2.length > 0) {
                pack.push(toPulledCard(pickRandom(pool2), 'Gold Rare', setPrefix));
            } else if (allGoldRares.length > 0) {
                pack.push(toPulledCard(pickRandom(allGoldRares), 'Gold Rare', setPrefix));
            }
        }
    } else if (name.includes('infinite gold')) {
        // Premium Gold: Infinite Gold
        // 3 Gold Rares (no specific ranges)
        for (let i = 0; i < 3; i++) {
            if (allGoldRares.length > 0) {
                pack.push(toPulledCard(pickRandom(allGoldRares), 'Gold Rare', setPrefix));
            }
        }
    } else {
        // Original Premium Gold
        // 1 gold rare from cards 33-50, 2 gold rares from cards 51-90
        const pool1 = filterByCardNumberRange(allGoldRares, setPrefix, 33, 50);
        const pool2 = filterByCardNumberRange(allGoldRares, setPrefix, 51, 90);

        if (pool1.length > 0) {
            pack.push(toPulledCard(pickRandom(pool1), 'Gold Rare', setPrefix));
        } else if (allGoldRares.length > 0) {
            pack.push(toPulledCard(pickRandom(allGoldRares), 'Gold Rare', setPrefix));
        }

        for (let i = 0; i < 2; i++) {
            if (pool2.length > 0) {
                pack.push(toPulledCard(pickRandom(pool2), 'Gold Rare', setPrefix));
            } else if (allGoldRares.length > 0) {
                pack.push(toPulledCard(pickRandom(allGoldRares), 'Gold Rare', setPrefix));
            }
        }
    }

    // Validate pack size
    if (pack.length < 5) {
        console.warn(`Premium Gold pack incomplete: expected 5, got ${pack.length} for ${setInfo.set_name}`);
    }

    return pack;
}


// --- Generic Generator ---
// Builds packs based on configuration, handling guaranteed slots and foil rolls

function generatePackFromConfig(setCards: Card[], setInfo: CardSet, config: PackConfig, fallbackFoilRarity: string = 'Common'): PulledCard[] {
    const pack: PulledCard[] = [];
    const setPrefix = setInfo.set_code;

    // Filter cards by rarity
    const commons = setCards.filter(c => isRarity(c, 'Common', setPrefix) || isRarity(c, 'Short Print', setPrefix));
    const rares = setCards.filter(c => isRarity(c, 'Rare', setPrefix));

    // 1. Add Guaranteed Commons
    for (let i = 0; i < config.guaranteedCommons; i++) {
        if (commons.length > 0) {
            const card = pickRandom(commons);
            const rarity = isRarity(card, 'Short Print', setPrefix) ? 'Short Print' : 'Common';
            pack.push(toPulledCard(card, rarity, setPrefix));
        }
    }

    // 2. Add Guaranteed Rare (if applicable)
    if (config.guaranteedRare) {
        if (rares.length > 0) {
            pack.push(toPulledCard(pickRandom(rares), 'Rare', setPrefix));
        } else if (commons.length > 0) {
            // Fallback to common if no rares available
            const card = pickRandom(commons);
            const rarity = isRarity(card, 'Short Print', setPrefix) ? 'Short Print' : 'Common';
            pack.push(toPulledCard(card, rarity, setPrefix));
        }
    }

    // 3. Foil / Ninth Slot
    if (config.foilSlot) {
        const foilResult = rollFoilSlot(setCards, setInfo, config, fallbackFoilRarity);
        if (foilResult) {
            pack.push(toPulledCard(foilResult.card, foilResult.rarity, setPrefix));
        } else {
            // If no foil pulled and not guaranteed foil, add common
            if (commons.length > 0) {
                const card = pickRandom(commons);
                const rarity = isRarity(card, 'Short Print', setPrefix) ? 'Short Print' : 'Common';
                pack.push(toPulledCard(card, rarity, setPrefix));
            }
        }
    }

    // 4. Validate pack size and fill if needed
    if (pack.length < config.cardsPerPack) {
        console.warn(`Pack underflow for ${setInfo.set_name}: expected ${config.cardsPerPack}, got ${pack.length}. Filling with commons.`);
        // Fill remaining slots with commons as emergency fallback
        while (pack.length < config.cardsPerPack && commons.length > 0) {
            const card = pickRandom(commons);
            const rarity = isRarity(card, 'Short Print', setPrefix) ? 'Short Print' : 'Common';
            pack.push(toPulledCard(card, rarity, setPrefix));
        }
    }

    return pack;
}

interface FoilResult {
    card: Card;
    rarity: string;
}

/**
 * Tries to find a card of the given rarity, or falls back through the rarity hierarchy.
 * This prevents jumping straight to common when a rolled rarity has no cards.
 */
function tryGetCardWithFallback(setCards: Card[], setPrefix: string, startRarity: string): FoilResult | null {
    const startIndex = RARITY_HIERARCHY.indexOf(startRarity);
    if (startIndex === -1) {
        // Unknown rarity, try it directly
        const pool = setCards.filter(c => isRarity(c, startRarity, setPrefix));
        if (pool.length > 0) return { card: pickRandom(pool), rarity: startRarity };
        return null;
    }

    // Try each rarity from the starting point down to Common
    for (const rarity of RARITY_HIERARCHY.slice(startIndex)) {
        const pool = setCards.filter(c => isRarity(c, rarity, setPrefix));
        if (pool.length > 0) {
            return { card: pickRandom(pool), rarity };
        }
    }

    return null;
}

/**
 * Rolls the foil slot using the "hat" method (LCM-based probability distribution).
 * See: pack_opening_rules.md "How We Use Ratios to Generate Pack Pulls"
 */
function rollFoilSlot(setCards: Card[], setInfo: CardSet, config: PackConfig, fallbackRarity: string): FoilResult | null {
    const setPrefix = setInfo.set_code;

    // The configured odds, rarest (highest 1-in-X denominator) first.
    const odds = Object.entries(config.ratios)
        .flatMap(([name, ratio]) => {
            const rarity = RARITIES.find(r => r === name);
            return rarity && ratio ? [{ rarity, ratio }] : [];
        })
        .sort((a, b) => b.ratio - a.ratio);
    if (odds.length === 0) return null;

    // Calculate Hat Size (LCM of ratios)
    const hatSize = lcmArray(odds.map(o => o.ratio));

    // Roll a number from 1 to hatSize
    const roll = Math.floor(Math.random() * hatSize) + 1;

    let currentThreshold = 0;

    for (const { rarity, ratio } of odds) {
        const slots = Math.floor(hatSize / ratio);

        if (roll <= currentThreshold + slots) {
            // Hit this rarity!

            // Handle "Ultimate can be upgrade" logic (SOD-ABPF eras)
            if (rarity === 'Ultimate Rare' && config.ultimateCanBeUpgrade) {
                const ultimates = setCards.filter(c => isRarity(c, 'Ultimate Rare', setPrefix));
                if (ultimates.length > 0) return { card: pickRandom(ultimates), rarity: 'Ultimate Rare' };
            }

            // Try to get a card of this rarity, falling back through hierarchy if needed
            const result = tryGetCardWithFallback(setCards, setPrefix, rarity);
            if (result) return result;
        }
        currentThreshold += slots;
    }

    // Didn't hit any specific foil from the hat
    // If foil is guaranteed (BOSH+ era), use fallback rarity with hierarchy fallback
    if (config.foilIsGuaranteed) {
        const result = tryGetCardWithFallback(setCards, setPrefix, fallbackRarity);
        if (result) return result;
    }

    return null; // No foil pulled (pre-BOSH behavior - caller adds common)
}


// --- Helpers ---

function generateSimplePack(setCards: Card[], setInfo: CardSet): PulledCard[] {
    const pack: PulledCard[] = [];
    const setPrefix = setInfo.set_code;
    const commons = setCards.filter(c => isRarity(c, 'Common', setPrefix));
    const rares = setCards.filter(c => isRarity(c, 'Rare', setPrefix));

    // 8 Commons
    for (let i = 0; i < 8; i++) {
        if (commons.length > 0) pack.push(toPulledCard(pickRandom(commons), 'Common', setPrefix));
    }

    // 1 Rare
    if (rares.length > 0) pack.push(toPulledCard(pickRandom(rares), 'Rare', setPrefix));
    else if (commons.length > 0) pack.push(toPulledCard(pickRandom(commons), 'Common', setPrefix));

    return pack;
}

function isRarity(card: Card, rarity: string, setPrefix: string): boolean {
    if (!card.card_sets) return false;
    return card.card_sets.some(s => s.set_code.startsWith(setPrefix) && s.set_rarity === rarity);
}

/** A random element of a non-empty array. Callers check for an empty pool first. */
function pickRandom<T>(items: readonly T[]): T {
    const item = items[Math.floor(Math.random() * items.length)];
    if (item === undefined) throw new Error("pickRandom: empty pool");
    return item;
}

function toPulledCard(card: Card, rarity: string, setCode: string): PulledCard {
    return {
        ...card,
        pulled_rarity: rarity,
        pulled_set_code: setCode
    };
}

// Math Helpers
function gcd(a: number, b: number): number {
    return !b ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
    return (a * b) / gcd(a, b);
}

function lcmArray(arr: number[]): number {
    return arr.reduce((acc, n) => lcm(acc, n), 1);
}
