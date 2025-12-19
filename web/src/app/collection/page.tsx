"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchCardsByIds, Card } from "@/lib/api";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import CardDetailModal from "@/components/CardDetailModal";
import CardTooltip from "@/components/CardTooltip";
import CollectionFilters, { FilterState } from "@/components/Collection/CollectionFilters";
import TopBar from "@/components/TopBar";
import { parseYDK, generateYDKFromCollection, downloadYDK } from "@/lib/ydk-parser";
import ParchmentButton from "@/components/ParchmentButton";
import GuideSprite from "@/components/GuideSprite";
import StonePanel from "@/components/StonePanel";
import { useCardTooltip } from "@/hooks/useCardTooltip";

export default function CollectionPage() {
    const { collection, activeSaveId, loadSave, importCollection } = useProgression();
    const [cards, setCards] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);
    const { hoveredCard, cursorPosition, handleMouseMove, setHoveredCard } = useCardTooltip();
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 60;

    const [filters, setFilters] = useState<FilterState>({
        search: "",
        set: "All",
        rarity: "All",
        category: "All",
        cardType: "All",
        subtype: "All",
        attribute: "All",
        level: "All",
        scale: "All",
        atkMin: "",
        atkMax: "",
        defMin: "",
        defMax: "",
        sort: "name_asc"
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const text = await file.text();
        const ids = parseYDK(text);

        if (ids.length === 0) {
            alert("No valid card IDs found in YDK file.");
            return;
        }

        const mode = confirm("Click OK to ADD cards to your collection.\nClick Cancel to REPLACE your collection with these cards.")
            ? 'add'
            : 'replace';

        // Double check for replace
        if (mode === 'replace') {
            if (!confirm("WARNING: This will DELETE your current collection and replace it with the YDK contents. Are you sure?")) {
                return;
            }
        }

        importCollection(ids, mode);
        alert(`Successfully imported ${ids.length} cards!`);

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleExportClick = async () => {
        const content = generateYDKFromCollection(collection);
        await downloadYDK('collection.ydk', content);
    };

    useEffect(() => {
        async function loadCollection() {
            if (!activeSaveId) {
                setLoading(false);
                return;
            }

            setLoading(true);
            // Collection keys are now strings: ID_SET_RARITY
            // We need to extract unique IDs to fetch card data
            const uniqueIds = new Set<number>();
            Object.keys(collection).forEach(key => {
                const [idStr] = key.split('_');
                const id = parseInt(idStr);
                if (!isNaN(id)) uniqueIds.add(id);
            });

            if (uniqueIds.size > 0) {
                const fetchedCards = await fetchCardsByIds(Array.from(uniqueIds));
                setCards(fetchedCards);
            } else {
                setCards([]);
            }
            setLoading(false);
        }
        loadCollection();
    }, [collection, activeSaveId]);

    // Filter & Sort Logic
    // Filtering Logic
    const filteredCards = useMemo(() => {
        // We need to filter based on the COLLECTION ENTRIES, not just the base cards.
        // Each entry in 'collection' is a specific variant we own.

        const collectionEntries = Object.entries(collection).map(([key, count]) => {
            const [idStr, setCode, rarity] = key.split('_');
            const id = parseInt(idStr);
            const card = cards.find(c => c.id === id);
            return { key, count, id, setCode, rarity, card };
        }).filter(entry => entry.card); // Filter out if card data missing

        return collectionEntries.filter(entry => {
            const { card, setCode, rarity } = entry;
            if (!card) return false;

            // Search
            if (filters.search) {
                const searchLower = filters.search.toLowerCase();
                if (!card.name.toLowerCase().includes(searchLower) && !card.desc.toLowerCase().includes(searchLower)) {
                    return false;
                }
            }

            // Set
            if (filters.set !== "All") {
                // Check if the PULLED set matches (or if unknown, check card sets)
                if (setCode && setCode !== "Unknown") {
                    // We need to match set NAME, but we have CODE.
                    // Ideally we'd have set name in key, but code is safer.
                    // We can look up the set name from the card data using the code.
                    const setInfo = card.card_sets?.find(s => s.set_code === setCode);
                    if (setInfo?.set_name !== filters.set) return false;
                } else {
                    // Fallback for legacy/imported: check if card belongs to set at all
                    const inSet = card.card_sets?.some(s => s.set_name === filters.set);
                    if (!inSet) return false;
                }
            }

            // Rarity
            if (filters.rarity !== "All") {
                // Check the PULLED rarity
                if (rarity && rarity !== "Unknown") {
                    if (rarity !== filters.rarity) return false;
                } else {
                    // Fallback
                    const hasRarity = card.card_sets?.some(s => s.set_rarity === filters.rarity);
                    if (!hasRarity) return false;
                }
            }

            // Category (Monster, Spell, Trap)
            if (filters.category !== "All") {
                if (filters.category === "Monster") {
                    if (card.type.includes("Spell") || card.type.includes("Trap")) return false;
                } else if (filters.category === "Spell") {
                    if (!card.type.includes("Spell")) return false;
                } else if (filters.category === "Trap") {
                    if (!card.type.includes("Trap")) return false;
                }
            }

            // Card Type (Normal, Effect, Fusion, etc.)
            if (filters.cardType !== "All") {
                // Special handling for Spell/Trap types (Continuous, Quick-Play, etc.) which are in 'race'
                const isSpellTrapType = [
                    "Normal Spell", "Continuous Spell", "Equip Spell", "Field Spell", "Quick-Play Spell", "Ritual Spell",
                    "Normal Trap", "Continuous Trap", "Counter Trap"
                ].includes(filters.cardType);

                if (isSpellTrapType) {
                    // Map filter value to race value
                    // e.g. "Continuous Spell" -> race="Continuous" && type="Spell Card"
                    const type = filters.cardType.includes("Spell") ? "Spell Card" : "Trap Card";
                    const race = filters.cardType.replace(" Spell", "").replace(" Trap", "");

                    if (!card.type.includes(type)) return false;
                    if (card.race !== race) return false;
                } else {
                    // Standard monster types
                    if (!card.type.includes(filters.cardType)) return false;
                }
            }

            // Subtype (Race)
            if (filters.subtype !== "All") {
                if (card.race !== filters.subtype) return false;
            }

            // Attribute
            if (filters.attribute !== "All") {
                if (card.attribute !== filters.attribute) return false;
            }

            // Level/Rank/Link
            if (filters.level !== "All") {
                const lvl = parseInt(filters.level);
                const cardLevel = card.level ?? (card as any).rank ?? card.linkval;
                if (cardLevel !== lvl) return false;
            }

            // Scale
            if (filters.scale !== "All") {
                const scl = parseInt(filters.scale);
                if (card.scale !== scl) return false;
            }

            // ATK
            if (filters.atkMin) {
                if (card.atk === undefined) return false;
                if (card.atk < parseInt(filters.atkMin)) return false;
            }
            if (filters.atkMax) {
                if (card.atk === undefined) return false;
                if (card.atk > parseInt(filters.atkMax)) return false;
            }

            // DEF
            if (filters.defMin) {
                if (card.def === undefined) return false;
                if (card.def < parseInt(filters.defMin)) return false;
            }
            if (filters.defMax) {
                if (card.def === undefined) return false;
                if (card.def > parseInt(filters.defMax)) return false;
            }

            return true;
        }).sort((a, b) => {
            const cardA = a.card!;
            const cardB = b.card!;
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
    }, [cards, collection, filters]);

    // Pagination
    const totalPages = Math.ceil(filteredCards.length / ITEMS_PER_PAGE);
    const displayedEntries = filteredCards.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filters]);



    if (loading && Object.keys(collection).length > 0) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-xl animate-pulse text-[#d4af37]">Loading Collection...</div>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen pb-32 flex flex-col"
            onMouseMove={handleMouseMove}
        >
            <GuideSprite />

            {/* Top Bar - Standard Navigation */}
            <TopBar />

            {/* Collection Sub-Header */}
            <div className="bg-[#1a120b] border-b-2 border-[#8b7355] p-4 shadow-md relative z-40">
                <div className="max-w-[1920px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white leading-none">My Collection</h1>
                        <p className="text-sm text-gray-400 font-mono mt-1">{filteredCards.length} Cards Found</p>
                    </div>

                    <div className="flex gap-4">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".ydk"
                            className="hidden"
                        />
                        <ParchmentButton onClick={handleImportClick}>
                            Import YDK
                        </ParchmentButton>
                        <ParchmentButton onClick={handleExportClick}>
                            Export YDK
                        </ParchmentButton>
                        <ParchmentButton
                            onClick={() => {
                                if (confirm("WARNING: This will PERMANENTLY DELETE your entire collection. This action cannot be undone. Are you sure?")) {
                                    importCollection([], 'replace');
                                }
                            }}
                            className="text-red-800 hover:text-red-600 border-red-800/50"
                        >
                            Delete Collection
                        </ParchmentButton>
                    </div>
                </div>
            </div>

            <div className="flex-1 p-4 md:p-8 overflow-hidden">
                <div className="max-w-[1920px] mx-auto h-full flex flex-col lg:flex-row gap-6 items-start">
                    {/* Sidebar Filters */}
                    <div className="w-full lg:w-auto sticky top-4 z-30">
                        <CollectionFilters onFilterChange={setFilters} />
                    </div>

                    {/* Main Content */}
                    <StonePanel className="flex-1 w-full min-h-[80vh]">
                        {Object.keys(collection).length === 0 ? (
                            <div className="text-center py-20">
                                <h2 className="text-2xl text-gray-400 mb-4">Your collection is empty</h2>
                                <p className="text-gray-500">Open some packs to start building your collection!</p>
                                <Link
                                    href="/map"
                                    className="inline-block mt-6 px-8 py-3 bg-[var(--primary)] text-black font-bold rounded-lg hover:bg-[#f5c542] transition-colors"
                                >
                                    Go to Map
                                </Link>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9 gap-2 md:gap-4">
                                    {displayedEntries.map((entry) => {
                                        const { card, count, rarity } = entry;
                                        if (!card) return null;

                                        return (
                                            <div
                                                key={entry.key}
                                                className="flex flex-col group cursor-pointer"
                                                onClick={() => setSelectedCard(card)}
                                                onMouseEnter={() => setHoveredCard(card)}
                                                onMouseLeave={() => setHoveredCard(null)}
                                            >
                                                <div className="relative aspect-[2/3] mb-2 hover:scale-105 transition-transform duration-200">
                                                    <div className="absolute inset-0 bg-[var(--card-bg)] rounded-lg shadow-lg overflow-hidden border border-white/10 group-hover:border-[var(--primary)]/50 transition-colors">
                                                        <Image
                                                            src={card.card_images[0].image_url}
                                                            alt={card.name}
                                                            fill
                                                            sizes="(max-width: 640px) 25vw, (max-width: 768px) 20vw, (max-width: 1024px) 16vw, (max-width: 1280px) 12vw, 11vw"
                                                            className="object-cover"
                                                            loading="lazy"
                                                        />
                                                        {/* Quantity Badge */}
                                                        <div className="absolute top-1 right-1 w-6 h-6 bg-black/80 rounded-full flex items-center justify-center border border-[#d4af37] shadow-md z-10">
                                                            <span className="text-xs font-bold text-[#d4af37]">
                                                                {count}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Card Info */}
                                                <div className="text-center px-1">
                                                    <div className="text-[10px] md:text-xs font-bold text-white leading-tight line-clamp-2 h-8 group-hover:text-[#d4af37] transition-colors">
                                                        {card.name}
                                                    </div>
                                                    <div className="text-[9px] md:text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">
                                                        {rarity && rarity !== "Unknown"
                                                            ? rarity
                                                            : (filters.rarity !== "All" && card.card_sets?.some(s => s.set_rarity === filters.rarity)
                                                                ? filters.rarity
                                                                : (card.card_sets?.[0]?.set_rarity || "Common")
                                                            )
                                                        }
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="flex justify-center mt-12 gap-2">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="px-4 py-2 bg-white/10 rounded hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Prev
                                        </button>
                                        <span className="px-4 py-2 text-[#d4af37] font-bold">
                                            Page {currentPage} of {totalPages}
                                        </span>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                            className="px-4 py-2 bg-white/10 rounded hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </StonePanel>
                </div>
            </div>

            {/* Modals & Tooltips */}
            {selectedCard && (
                <CardDetailModal
                    card={selectedCard}
                    onClose={() => setSelectedCard(null)}
                />
            )}

            {hoveredCard && (
                <CardTooltip
                    card={hoveredCard}
                    x={cursorPosition.x}
                    y={cursorPosition.y}
                />
            )}
        </div>
    );
}
