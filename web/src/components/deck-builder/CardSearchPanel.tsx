"use client";

import { useState, useMemo } from "react";
import { Card } from "@/lib/api";
import DeckSlot from "./DeckSlot";

interface CardSearchPanelProps {
    collectionCards: { card: Card; count: number }[];
    onHover: (card: Card | null) => void;
    onDragStart: (e: React.DragEvent, card: Card, from: 'search') => void;
    onDrag: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
    onCardDoubleClick?: (card: Card) => void;
    /** Cosmetically-banned card ids (Phase 5): greyed + marked, add is blocked. */
    bannedIds?: Set<number>;
}

export default function CardSearchPanel({ collectionCards = [], onHover, onDragStart, onDrag, onDragEnd, onCardDoubleClick, bannedIds }: CardSearchPanelProps) {
    // --- Filters State ---
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [cardType, setCardType] = useState("All"); // Monster, Spell, Trap
    const [monsterType, setMonsterType] = useState("All"); // Warrior, etc.
    const [attribute, setAttribute] = useState("All");
    const [levelMin, setLevelMin] = useState("");
    const [levelMax, setLevelMax] = useState("");
    const [atkMin, setAtkMin] = useState("");
    const [atkMax, setAtkMax] = useState("");
    const [defMin, setDefMin] = useState("");
    const [defMax, setDefMax] = useState("");
    const [sortOrder, setSortOrder] = useState("name_asc");

    // Pagination
    const [page, setPage] = useState(1);
    const pageSize = 20;

    // --- Filtering Logic ---
    const filteredCards = useMemo(() => {
        const result = collectionCards.map(c => c.card).filter(card => {
            if (!card) return false;

            // Name
            if (name && !card.name.toLowerCase().includes(name.toLowerCase())) return false;

            // Desc
            if (desc && !card.desc.toLowerCase().includes(desc.toLowerCase())) return false;

            // Card Category (Monster/Spell/Trap)
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

            // Monster Type (Race)
            if (monsterType !== "All" && card.race !== monsterType) return false;

            // Attribute
            if (attribute !== "All" && card.attribute !== attribute) return false;

            // Stats
            const lvl = card.level ?? card.rank ?? card.linkval;
            if (levelMin && (lvl == null || lvl < parseInt(levelMin))) return false;
            if (levelMax && (lvl == null || lvl > parseInt(levelMax))) return false;

            if (atkMin && (card.atk == null || card.atk < parseInt(atkMin))) return false;
            if (atkMax && (card.atk == null || card.atk > parseInt(atkMax))) return false;

            if (defMin && (card.def == null || card.def < parseInt(defMin))) return false;
            if (defMax && (card.def == null || card.def > parseInt(defMax))) return false;

            return true;
        });

        // Sorting
        result.sort((a, b) => {
            switch (sortOrder) {
                case "name_asc": return a.name.localeCompare(b.name);
                case "name_desc": return b.name.localeCompare(a.name);
                case "atk_desc": return (b.atk || 0) - (a.atk || 0);
                case "def_desc": return (b.def || 0) - (a.def || 0);
                case "level_desc": return ((b.level || 0) - (a.level || 0));
                case "newest": return b.id - a.id;
                default: return 0;
            }
        });

        return result;
    }, [collectionCards, name, desc, cardType, monsterType, attribute, levelMin, levelMax, atkMin, atkMax, defMin, defMax, sortOrder]);

    const totalPages = Math.ceil(filteredCards.length / pageSize) || 1;

    // Reset page on filter change (handled by effect or manually)
    // Simple way: ensure page is valid
    const safePage = Math.min(Math.max(1, page), totalPages);
    const currentCards = filteredCards.slice((safePage - 1) * pageSize, safePage * pageSize);

    const handlePrev = () => setPage(p => Math.max(1, p - 1));
    const handleNext = () => setPage(p => Math.min(totalPages, p + 1));


    // --- UI Data ---
    const attributes = ["All", "DARK", "LIGHT", "EARTH", "WATER", "FIRE", "WIND", "DIVINE"];
    const types = ["All", "Warrior", "Spellcaster", "Fairy", "Fiend", "Zombie", "Machine", "Aqua", "Pyro", "Rock", "Winged Beast", "Plant", "Insect", "Thunder", "Dragon", "Beast", "Beast-Warrior", "Dinosaur", "Fish", "Sea Serpent", "Reptile", "Psychic", "Wyrm", "Cyberse", "Divine-Beast", "Creator-God"];
    const cardCategories = ["All", "Monster", "Spell", "Trap", "Extra"];

    return (
        <div className="flex flex-col h-full bg-lime font-sans text-black">
            {/* Header */}
            <div className="bg-lime p-1 flex items-center justify-between border-b border-olive">
                <h2 className="text-2xl font-bold tracking-tighter">SEARCH</h2>
                <div className="flex gap-1">
                    {/* Placeholder for camera icon */}
                </div>
            </div>

            {/* Inputs Grid */}
            <div className="p-2 flex flex-col gap-1 text-sm font-bold bg-lime-bright/50">
                {/* Name */}
                <div className="flex items-center gap-2">
                    <label className="w-12 text-right">Name:</label>
                    <input
                        className="flex-1 border border-gray-400 px-1 text-sm h-6"
                        value={name} onChange={e => setName(e.target.value)}
                    />
                </div>
                {/* Desc */}
                <div className="flex items-center gap-2">
                    <label className="w-12 text-right">Desc:</label>
                    <input
                        className="flex-1 border border-gray-400 px-1 text-sm h-6"
                        value={desc} onChange={e => setDesc(e.target.value)}
                    />
                </div>

                {/* Dropdowns Row 1: Category & Type */}
                <div className="flex items-center gap-2">
                    <label className="w-12 text-right">Card:</label>
                    <select className="flex-1 border border-gray-400 h-6 text-xs" value={cardType} onChange={e => setCardType(e.target.value)}>
                        {cardCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <label className="w-auto">Type:</label>
                    <select className="flex-1 border border-gray-400 h-6 text-xs" value={monsterType} onChange={e => setMonsterType(e.target.value)}>
                        {types.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>

                {/* Dropdowns Row 2: Attribute & Level */}
                <div className="flex items-center gap-1">
                    <label className="w-12 text-right">Attrib:</label>
                    <select className="w-20 border border-gray-400 h-6 text-xs" value={attribute} onChange={e => setAttribute(e.target.value)}>
                        {attributes.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>

                    <input className="w-8 border border-gray-400 h-6 text-center" placeholder="" value={levelMin} onChange={e => setLevelMin(e.target.value)} />
                    <span className="text-xs">≤ Lvl ≤</span>
                    <input className="w-8 border border-gray-400 h-6 text-center" placeholder="" value={levelMax} onChange={e => setLevelMax(e.target.value)} />
                </div>

                {/* ATK / DEF */}
                <div className="flex items-center gap-1">
                    <input className="w-12 border border-gray-400 h-6 text-center ml-[52px]" placeholder="" value={atkMin} onChange={e => setAtkMin(e.target.value)} />
                    <span className="text-xs">≤ ATK ≤</span>
                    <input className="w-12 border border-gray-400 h-6 text-center" placeholder="" value={atkMax} onChange={e => setAtkMax(e.target.value)} />
                </div>
                <div className="flex items-center gap-1">
                    <input className="w-12 border border-gray-400 h-6 text-center ml-[52px]" placeholder="" value={defMin} onChange={e => setDefMin(e.target.value)} />
                    <span className="text-xs">≤ DEF ≤</span>
                    <input className="w-12 border border-gray-400 h-6 text-center" placeholder="" value={defMax} onChange={e => setDefMax(e.target.value)} />
                </div>

                {/* Order */}
                <div className="flex items-center gap-2 mt-1">
                    <label className="w-12 text-right">Order:</label>
                    <select className="flex-1 border border-gray-400 h-6 text-xs" value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
                        <option value="name_asc">Name (A-Z)</option>
                        <option value="name_desc">Name (Z-A)</option>
                        <option value="atk_desc">ATK (High)</option>
                        <option value="def_desc">DEF (High)</option>
                        <option value="level_desc">Level (High)</option>
                        <option value="newest">Newest</option>
                    </select>
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between mt-2 bg-olive-bright p-1 rounded border border-olive-mid">
                    <button onClick={handlePrev} className="w-8 h-8 bg-black text-white hover:bg-gray-800 disabled:opacity-50 clip-arrow-left">
                        ◄
                    </button>
                    <span className="font-bold text-lg">{safePage} / {totalPages}</span>
                    <button onClick={handleNext} className="w-8 h-8 bg-black text-white hover:bg-gray-800 disabled:opacity-50 clip-arrow-right">
                        ►
                    </button>
                </div>
            </div>

            {/* Results Grid */}
            <div className="flex-1 overflow-y-auto p-1 bg-lime-pale">
                <div className="grid grid-cols-4 gap-1">
                    {currentCards.map((card, i) => {
                        const count = collectionCards.find(c => c.card.id === card.id)?.count || 0;
                        const isBanned = bannedIds?.has(card.id) ?? false;
                        return (
                            <div key={card.id + i} className="relative">
                                <DeckSlot
                                    index={i}
                                    card={card}
                                    isUnavailable={count === 0}
                                    banned={isBanned}
                                    dragContext="search"
                                    onHover={onHover}
                                    onDragStart={(e) => onDragStart(e, card, 'search')}
                                    onDrag={onDrag}
                                    onDragEnd={onDragEnd}
                                    onDoubleClick={() => onCardDoubleClick && onCardDoubleClick(card)}
                                />
                                <div className="absolute bottom-0 right-0 bg-black/80 text-white text-[10px] px-1 rounded-tl pointer-events-none font-mono">
                                    x{count}
                                </div>
                            </div>
                        );
                    })}
                </div>
                {/* Pad empty slots to maintain grid look if wanted, or just leave whitespace */}
            </div>
        </div>
    );
}
