import type { Card } from "@/lib/api";
import type { FilterState } from "@/components/collection/CollectionFilters";
import { parseCollectionKey, UNKNOWN_SET, type Collection } from "@/lib/collection";

export type OwnedEntry = { key: string; count: number; id: number; setCode: string; rarity: string; card: Card };

/**
 * The owned cards (one entry per ID_SET_RARITY held) that pass `filters`, in its
 * sort. The collection page's own rules, moved here unchanged.
 */
export function filterCollection(collection: Collection, cards: Card[], filters: FilterState): OwnedEntry[] {
    const cardsById = new Map(cards.map((c) => [c.id, c]));
    const collectionEntries = Object.entries(collection).flatMap(([key, count]) => {
        const parsed = parseCollectionKey(key);
        const card = parsed && cardsById.get(parsed.id);
        return parsed && card ? [{ key, count, ...parsed, card }] : [];
    });

    return collectionEntries
        .filter((entry) => {
            const { card, setCode, rarity } = entry;

            // Search
            if (filters.search) {
                const searchLower = filters.search.toLowerCase();
                if (!card.name.toLowerCase().includes(searchLower) && !card.desc.toLowerCase().includes(searchLower)) {
                    return false;
                }
            }

            // Set — prefer the PULLED set code, fall back to card's set list
            if (filters.set !== "All") {
                if (setCode !== UNKNOWN_SET) {
                    const setInfo = card.card_sets?.find((s) => s.set_code === setCode);
                    if (setInfo?.set_name !== filters.set) return false;
                } else {
                    const inSet = card.card_sets?.some((s) => s.set_name === filters.set);
                    if (!inSet) return false;
                }
            }

            // Rarity — prefer the PULLED rarity, fall back to card's set list
            if (filters.rarity !== "All") {
                if (rarity !== "Unknown") {
                    if (rarity !== filters.rarity) return false;
                } else {
                    const hasRarity = card.card_sets?.some((s) => s.set_rarity === filters.rarity);
                    if (!hasRarity) return false;
                }
            }

            // Category (Monster / Spell / Trap)
            if (filters.category !== "All") {
                if (filters.category === "Monster") {
                    if (card.type.includes("Spell") || card.type.includes("Trap")) return false;
                } else if (filters.category === "Spell") {
                    if (!card.type.includes("Spell")) return false;
                } else if (filters.category === "Trap") {
                    if (!card.type.includes("Trap")) return false;
                }
            }

            // Card Type — Spell/Trap subtypes live in `race`; monster types in `type`
            if (filters.cardType !== "All") {
                const isSpellTrapType = [
                    "Normal Spell", "Continuous Spell", "Equip Spell", "Field Spell", "Quick-Play Spell", "Ritual Spell",
                    "Normal Trap", "Continuous Trap", "Counter Trap",
                ].includes(filters.cardType);

                if (isSpellTrapType) {
                    const type = filters.cardType.includes("Spell") ? "Spell Card" : "Trap Card";
                    const race = filters.cardType.replace(" Spell", "").replace(" Trap", "");
                    if (!card.type.includes(type)) return false;
                    if (card.race !== race) return false;
                } else {
                    if (!card.type.includes(filters.cardType)) return false;
                }
            }

            // Subtype (Race)
            if (filters.subtype !== "All" && card.race !== filters.subtype) return false;

            // Attribute
            if (filters.attribute !== "All" && card.attribute !== filters.attribute) return false;

            // Level / Rank / Link
            if (filters.level !== "All") {
                const lvl = parseInt(filters.level);
                const cardLevel = card.level ?? card.rank ?? card.linkval;
                if (cardLevel !== lvl) return false;
            }

            // Scale
            if (filters.scale !== "All" && card.scale !== parseInt(filters.scale)) return false;

            // ATK / DEF ranges
            if (filters.atkMin) {
                if (card.atk === undefined || card.atk < parseInt(filters.atkMin)) return false;
            }
            if (filters.atkMax) {
                if (card.atk === undefined || card.atk > parseInt(filters.atkMax)) return false;
            }
            if (filters.defMin) {
                if (card.def === undefined || card.def < parseInt(filters.defMin)) return false;
            }
            if (filters.defMax) {
                if (card.def === undefined || card.def > parseInt(filters.defMax)) return false;
            }

            return true;
        })
        .sort((a, b) => {
            const cardA = a.card;
            const cardB = b.card;
            switch (filters.sort) {
                case "name_asc": return cardA.name.localeCompare(cardB.name);
                case "name_desc": return cardB.name.localeCompare(cardA.name);
                case "atk_desc": return (cardB.atk || 0) - (cardA.atk || 0);
                case "def_desc": return (cardB.def || 0) - (cardA.def || 0);
                case "level_desc": return (cardB.level || 0) - (cardA.level || 0);
                case "newest": return cardB.id - cardA.id;
                case "oldest": return cardA.id - cardB.id;
                default: return 0;
            }
        });
}
