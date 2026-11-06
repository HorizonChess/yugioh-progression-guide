"use client";

import { useMemo, useState } from "react";
import { Card } from "@/lib/api";

/**
 * The deck builder's card search: every filter the search panel has (name, text,
 * card kind, monster type, attribute, level, ATK and DEF ranges, order), as one
 * hook, so the desktop panel and the phone drawer filter the same way.
 */
export function useCardFilters(cards: Card[]) {
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [cardType, setCardType] = useState("All"); // Monster, Spell, Trap, Extra
    const [monsterType, setMonsterType] = useState("All"); // Warrior, etc.
    const [attribute, setAttribute] = useState("All");
    const [levelMin, setLevelMin] = useState("");
    const [levelMax, setLevelMax] = useState("");
    const [atkMin, setAtkMin] = useState("");
    const [atkMax, setAtkMax] = useState("");
    const [defMin, setDefMin] = useState("");
    const [defMax, setDefMax] = useState("");
    const [sortOrder, setSortOrder] = useState("name_asc");

    const filtered = useMemo(() => {
        const result = cards.filter((card) => {
            if (!card) return false;
            if (name && !card.name.toLowerCase().includes(name.toLowerCase())) return false;
            if (desc && !card.desc.toLowerCase().includes(desc.toLowerCase())) return false;
            if (cardType !== "All") {
                if (cardType === "Monster") {
                    if (card.type.includes("Spell") || card.type.includes("Trap")) return false;
                } else if (cardType === "Spell") {
                    if (!card.type.includes("Spell")) return false;
                } else if (cardType === "Trap") {
                    if (!card.type.includes("Trap")) return false;
                } else if (cardType === "Extra") {
                    if (!card.type.includes("Fusion") && !card.type.includes("Synchro") && !card.type.includes("XYZ") && !card.type.includes("Link")) return false;
                }
            }
            if (monsterType !== "All" && card.race !== monsterType) return false;
            if (attribute !== "All" && card.attribute !== attribute) return false;
            const lvl = card.level ?? card.rank ?? card.linkval;
            if (levelMin && (lvl == null || lvl < parseInt(levelMin))) return false;
            if (levelMax && (lvl == null || lvl > parseInt(levelMax))) return false;
            if (atkMin && (card.atk == null || card.atk < parseInt(atkMin))) return false;
            if (atkMax && (card.atk == null || card.atk > parseInt(atkMax))) return false;
            if (defMin && (card.def == null || card.def < parseInt(defMin))) return false;
            if (defMax && (card.def == null || card.def > parseInt(defMax))) return false;
            return true;
        });
        result.sort((a, b) => {
            switch (sortOrder) {
                case "name_asc": return a.name.localeCompare(b.name);
                case "name_desc": return b.name.localeCompare(a.name);
                case "atk_desc": return (b.atk || 0) - (a.atk || 0);
                case "def_desc": return (b.def || 0) - (a.def || 0);
                case "level_desc": return (b.level || 0) - (a.level || 0);
                case "newest": return b.id - a.id;
                default: return 0;
            }
        });
        return result;
    }, [cards, name, desc, cardType, monsterType, attribute, levelMin, levelMax, atkMin, atkMax, defMin, defMax, sortOrder]);

    /** How many filters beyond the name and the kind are set (for a badge). */
    const extraActive = [desc, monsterType !== "All", attribute !== "All", levelMin, levelMax, atkMin, atkMax, defMin, defMax, sortOrder !== "name_asc"].filter(Boolean).length;

    return {
        filtered, extraActive,
        name, setName, desc, setDesc, cardType, setCardType, monsterType, setMonsterType, attribute, setAttribute,
        levelMin, setLevelMin, levelMax, setLevelMax, atkMin, setAtkMin, atkMax, setAtkMax, defMin, setDefMin, defMax, setDefMax,
        sortOrder, setSortOrder,
    };
}

export type CardFilters = ReturnType<typeof useCardFilters>;

const ATTRIBUTES = ["All", "DARK", "LIGHT", "EARTH", "WATER", "FIRE", "WIND", "DIVINE"];
const TYPES = ["All", "Warrior", "Spellcaster", "Fairy", "Fiend", "Zombie", "Machine", "Aqua", "Pyro", "Rock", "Winged Beast", "Plant", "Insect", "Thunder", "Dragon", "Beast", "Beast-Warrior", "Dinosaur", "Fish", "Sea Serpent", "Reptile", "Psychic", "Wyrm", "Cyberse", "Divine-Beast", "Creator-God"];
export const CARD_KINDS = ["All", "Monster", "Spell", "Trap", "Extra"];

/** The filter fields, in parchment: `withName` false leaves the name box to the caller. */
export function CardFilterFields({ f, withName = true }: { f: CardFilters; withName?: boolean }) {
    const range = (label: string, min: string, setMin: (v: string) => void, max: string, setMax: (v: string) => void) => (
        <>
            <span>{label}</span>
            <span className="db-pair">
                <input inputMode="numeric" placeholder="min" value={min} onChange={(e) => setMin(e.target.value)} aria-label={`${label} from`} />
                <i>≤</i>
                <input inputMode="numeric" placeholder="max" value={max} onChange={(e) => setMax(e.target.value)} aria-label={`${label} to`} />
            </span>
        </>
    );
    return (
        <div className="db-fields">
            {withName && (<><span>Name</span><input value={f.name} onChange={(e) => f.setName(e.target.value)} aria-label="Name" /></>)}
            <span>Text</span><input value={f.desc} onChange={(e) => f.setDesc(e.target.value)} aria-label="Card text" />
            <span>Card</span>
            <select value={f.cardType} onChange={(e) => f.setCardType(e.target.value)} aria-label="Card kind">{CARD_KINDS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <span>Type</span>
            <select value={f.monsterType} onChange={(e) => f.setMonsterType(e.target.value)} aria-label="Monster type">{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <span>Attrib</span>
            <select value={f.attribute} onChange={(e) => f.setAttribute(e.target.value)} aria-label="Attribute">{ATTRIBUTES.map((a) => <option key={a} value={a}>{a}</option>)}</select>
            {range("Level", f.levelMin, f.setLevelMin, f.levelMax, f.setLevelMax)}
            {range("ATK", f.atkMin, f.setAtkMin, f.atkMax, f.setAtkMax)}
            {range("DEF", f.defMin, f.setDefMin, f.defMax, f.setDefMax)}
            <span>Order</span>
            <select value={f.sortOrder} onChange={(e) => f.setSortOrder(e.target.value)} aria-label="Order">
                <option value="name_asc">Name (A–Z)</option>
                <option value="name_desc">Name (Z–A)</option>
                <option value="atk_desc">ATK (High)</option>
                <option value="def_desc">DEF (High)</option>
                <option value="level_desc">Level (High)</option>
                <option value="newest">Newest</option>
            </select>
        </div>
    );
}
