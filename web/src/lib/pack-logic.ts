import { Card, CardSet } from './api';

// Booster Pack Logic

export interface PackResult {
    cards: Card[];
}

// Rarity Definitions
type Rarity = 'Common' | 'Rare' | 'Super Rare' | 'Ultra Rare' | 'Secret Rare' | 'Ultimate Rare' | 'Ghost Rare' | 'Starlight Rare' | 'Short Print';

// Era Definitions
enum Era {
    PreSoulOfTheDuelist, // LOB -> AST
    SoulOfTheDuelistToCyberdark, // SOD -> CDIP
    StrikeOfNeosToForceOfTheBreaker, // STON -> FOTB
    TacticalEvolutionToAbsolutePowerforce, // TAEV -> ABPF
    ShiningDarknessToDimensionOfChaos, // TSHD -> DOCS
    BreakersOfShadowToDarkNeostorm, // BOSH -> DANE
    RisingRampageToIgnitionAssault, // RIRA -> IGAS
    EternityCodeToPresent, // ETCO -> Present
}

// Pack Type Definitions
enum PackType {
    Core,
    Tournament, // TP, CP, TU, AP, OTS
    Duelist,
    Reprint, // Dark Beginning, Dark Revelation, Retro Pack
    PremiumGold,
    Other // Fallback
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

export function generateBoosterPack(setCards: Card[], setInfo: CardSet): Card[] {
    const pack: Card[] = [];
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

function generateCorePack(setCards: Card[], setInfo: CardSet): Card[] {
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

function getCoreEraConfig(era: Era): PackConfig {
    switch (era) {
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
        case Era.BreakersOfShadowToDarkNeostorm:
            return {
                cardsPerPack: 9,
                guaranteedCommons: 7,
                guaranteedRare: true,
                foilSlot: true,
                foilIsGuaranteed: true,
                ratios: { 'Ultra Rare': 6, 'Secret Rare': 12 }, // Super is fallback
                ultimateCanBeUpgrade: false
            };
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
        case Era.EternityCodeToPresent:
            return {
                cardsPerPack: 9,
                guaranteedCommons: 8, // Rares discontinued
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

function generateTournamentPack(setCards: Card[], setInfo: CardSet): Card[] {
    const name = setInfo.set_name.toLowerCase();
    let config: PackConfig;

    if (name.includes('tournament pack')) {
        config = {
            cardsPerPack: 3,
            guaranteedCommons: 2,
            guaranteedRare: false,
            foilSlot: true,
            foilIsGuaranteed: false, // Can be common
            ratios: { 'Rare': 3, 'Super Rare': 18, 'Ultra Rare': 108 },
            ultimateCanBeUpgrade: false
        };
    } else if (name.includes('champion pack')) {
        config = {
            cardsPerPack: 3,
            guaranteedCommons: 2,
            guaranteedRare: false, // If not foil, it's Rare
            foilSlot: true,
            foilIsGuaranteed: true, // "If it was not one of the possible foils it would be a rare" -> effectively guaranteed "non-common"
            ratios: { 'Super Rare': 12, 'Ultra Rare': 48 }, // Fallback is Rare
            ultimateCanBeUpgrade: false
        };
    } else if (name.includes('turbo pack')) {
        config = {
            cardsPerPack: 3,
            guaranteedCommons: 2,
            guaranteedRare: false,
            foilSlot: true,
            foilIsGuaranteed: true, // Fallback Rare
            ratios: { 'Super Rare': 12, 'Ultra Rare': 32, 'Ultimate Rare': 32 },
            ultimateCanBeUpgrade: false
        };
    } else { // Astral and OTS
        config = {
            cardsPerPack: 3,
            guaranteedCommons: 2,
            guaranteedRare: false,
            foilSlot: true,
            foilIsGuaranteed: true, // Fallback Super (No Rares)
            ratios: { 'Ultimate Rare': 20 }, // Fallback Super
            ultimateCanBeUpgrade: false
        };
    }

    return generatePackFromConfig(setCards, setInfo, config, (name.includes('astral') || name.includes('ots')) ? 'Super Rare' : 'Rare');
}

// --- Duelist Pack Logic ---

function generateDuelistPack(setCards: Card[], setInfo: CardSet): Card[] {
    const name = setInfo.set_name.toLowerCase();
    let config: PackConfig;

    if (name.includes('kaiba')) {
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
        // Jaden 1 to Jesse Anderson era
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
        // Yusei onwards / Default
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

function generateReprintPack(setCards: Card[], setInfo: CardSet): Card[] {
    const name = setInfo.set_name.toLowerCase();
    let config: PackConfig;

    if (name.includes('dark revelation volume 4')) {
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

function generatePremiumGoldPack(setCards: Card[], setInfo: CardSet): Card[] {
    const goldSecrets = setCards.filter(c => isRarity(c, 'Gold Secret Rare', setInfo.set_code));
    const goldRares = setCards.filter(c => isRarity(c, 'Gold Rare', setInfo.set_code));

    const pack: Card[] = [];

    // 2 Gold Secrets
    for (let i = 0; i < 2; i++) {
        if (goldSecrets.length > 0) pack.push(getRandomCard(goldSecrets));
    }

    // 3 Gold Rares
    for (let i = 0; i < 3; i++) {
        if (goldRares.length > 0) pack.push(getRandomCard(goldRares));
    }

    return pack;
}


// --- Generic Generator ---

function generatePackFromConfig(setCards: Card[], setInfo: CardSet, config: PackConfig, fallbackFoilRarity: string = 'Common'): Card[] {
    const pack: Card[] = [];
    const setPrefix = setInfo.set_code;

    // Filter cards by rarity
    const commons = setCards.filter(c => isRarity(c, 'Common', setPrefix) || isRarity(c, 'Short Print', setPrefix));
    const rares = setCards.filter(c => isRarity(c, 'Rare', setPrefix));

    // 1. Add Guaranteed Commons
    for (let i = 0; i < config.guaranteedCommons; i++) {
        if (commons.length > 0) pack.push(getRandomCard(commons));
    }

    // 2. Add Guaranteed Rare (if applicable)
    if (config.guaranteedRare) {
        if (rares.length > 0) {
            pack.push(getRandomCard(rares));
        } else if (commons.length > 0) {
            pack.push(getRandomCard(commons)); // Fallback
        }
    }

    // 3. Foil / Ninth Slot
    if (config.foilSlot) {
        const foilCard = rollFoilSlot(setCards, setInfo, config, fallbackFoilRarity);
        if (foilCard) {
            pack.push(foilCard);
        } else {
            // If no foil pulled and not guaranteed foil, add common
            if (commons.length > 0) pack.push(getRandomCard(commons));
        }
    }

    return pack;
}

function rollFoilSlot(setCards: Card[], setInfo: CardSet, config: PackConfig, fallbackRarity: string): Card | null {
    const setPrefix = setInfo.set_code;

    // Calculate Hat Size (LCM of ratios)
    const ratios = config.ratios;
    const denoms = Object.values(ratios).map(v => v!);
    if (denoms.length === 0) return null;

    const hatSize = lcmArray(denoms);

    // Roll
    const roll = Math.floor(Math.random() * hatSize) + 1; // 1 to hatSize

    let currentThreshold = 0;

    // Sort rarities by "rarity" (scarcity) - usually highest denominator first (lowest prob)
    const sortedRarities = (Object.keys(ratios) as Rarity[]).sort((a, b) => (ratios[b] || 0) - (ratios[a] || 0));

    for (const rarity of sortedRarities) {
        const ratio = ratios[rarity]!;
        const slots = Math.floor(hatSize / ratio);

        if (roll <= currentThreshold + slots) {
            // Hit this rarity!

            // Handle "Ultimate can be upgrade" logic
            if (rarity === 'Ultimate Rare' && config.ultimateCanBeUpgrade) {
                const ultimates = setCards.filter(c => isRarity(c, 'Ultimate Rare', setPrefix));
                if (ultimates.length > 0) return getRandomCard(ultimates);
            }

            const pool = setCards.filter(c => isRarity(c, rarity, setPrefix));
            if (pool.length > 0) return getRandomCard(pool);
        }
        currentThreshold += slots;
    }

    // If we are here, we didn't roll a specific foil from the hat.
    // If foil is guaranteed, we return the fallback rarity.
    if (config.foilIsGuaranteed) {
        const fallbackPool = setCards.filter(c => isRarity(c, fallbackRarity, setPrefix));
        if (fallbackPool.length > 0) return getRandomCard(fallbackPool);

        // If fallback fails (e.g. no Rares in OTS pack), try Super
        if (fallbackRarity === 'Rare') {
            const superPool = setCards.filter(c => isRarity(c, 'Super Rare', setPrefix));
            if (superPool.length > 0) return getRandomCard(superPool);
        }
    }

    return null; // Common (handled by caller)
}


// --- Helpers ---

function generateSimplePack(setCards: Card[], setInfo: CardSet): Card[] {
    const pack: Card[] = [];
    const setPrefix = setInfo.set_code;
    const commons = setCards.filter(c => isRarity(c, 'Common', setPrefix));
    const rares = setCards.filter(c => isRarity(c, 'Rare', setPrefix));

    // 8 Commons
    for (let i = 0; i < 8; i++) {
        if (commons.length > 0) pack.push(getRandomCard(commons));
    }

    // 1 Rare
    if (rares.length > 0) pack.push(getRandomCard(rares));
    else if (commons.length > 0) pack.push(getRandomCard(commons));

    return pack;
}

function isRarity(card: Card, rarity: string, setPrefix: string): boolean {
    if (!card.card_sets) return false;
    return card.card_sets.some(s => s.set_code.startsWith(setPrefix) && s.set_rarity === rarity);
}

function getRandomCard(cards: Card[]): Card {
    if (cards.length === 0) return {} as Card;
    const index = Math.floor(Math.random() * cards.length);
    return cards[index];
}

// Math Helpers
function gcd(a: number, b: number): number {
    return !b ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
    return (a * b) / gcd(a, b);
}

function lcmArray(arr: number[]): number {
    if (arr.length === 0) return 1;
    let result = arr[0];
    for (let i = 1; i < arr.length; i++) {
        result = lcm(result, arr[i]);
    }
    return result;
}
