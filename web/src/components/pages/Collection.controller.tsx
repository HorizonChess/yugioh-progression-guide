"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchCardsByIds, Card } from "@/lib/api";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import CardDetailModal from "@/components/card/CardDetailModal.view";
import CardTooltip from "@/components/card/CardTooltip.view";
import CollectionFilters, { FilterState } from "@/components/Collection/CollectionFilters.view";
import CollectionCard from "@/components/Collection/CollectionCard.view";
import CollectionPagination from "@/components/Collection/CollectionPagination.view";
import TopBar from "@/components/shell/TopBar.view";
import { parseYDK, generateYDKFromCollection, downloadYDK } from "@/lib/ydk-parser";
import ParchmentButton from "@/components/ui/ParchmentButton.view";
import GuideSprite from "@/components/shell/GuideSprite.view";
import StonePanel from "@/components/ui/StonePanel.view";
import { useCardTooltip } from "@/hooks/useCardTooltip";

const ITEMS_PER_PAGE = 60;

/**
 * The card COLLECTION browser (route: /collection). Owned cards in a filterable,
 * sortable, paginated grid, with YDK import/export and per-card detail/tooltip.
 */
export default function Collection() {
    const { collection, importCollection, activeSaveId } = useProgression();
    const [cards, setCards] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);
    const { hoveredCard, tooltipPosition, onHover, onLeave } = useCardTooltip();
    const [currentPage, setCurrentPage] = useState(1);

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
        sort: "name_asc",
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImportClick = () => fileInputRef.current?.click();

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
            ? "add"
            : "replace";

        if (mode === "replace") {
            if (!confirm("WARNING: This will DELETE your current collection and replace it with the YDK contents. Are you sure?")) {
                return;
            }
        }

        importCollection(ids, mode);
        alert(`Successfully imported ${ids.length} cards!`);

        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleExportClick = async () => {
        const content = generateYDKFromCollection(collection);
        await downloadYDK("collection.ydk", content);
    };

    useEffect(() => {
        async function loadCollection() {
            if (!activeSaveId) {
                setLoading(false);
                return;
            }

            setLoading(true);
            // Collection keys are strings: ID_SET_RARITY — extract unique IDs to fetch card data
            const uniqueIds = new Set<number>();
            Object.keys(collection).forEach((key) => {
                const [idStr] = key.split("_");
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

    // Filter + sort the OWNED variants (one entry per ID_SET_RARITY we hold)
    const filteredCards = useMemo(() => {
        const collectionEntries = Object.entries(collection)
            .map(([key, count]) => {
                const [idStr, setCode, rarity] = key.split("_");
                const id = parseInt(idStr);
                const card = cards.find((c) => c.id === id);
                return { key, count, id, setCode, rarity, card };
            })
            .filter((entry) => entry.card);

        return collectionEntries
            .filter((entry) => {
                const { card, setCode, rarity } = entry;
                if (!card) return false;

                // Search
                if (filters.search) {
                    const searchLower = filters.search.toLowerCase();
                    if (!card.name.toLowerCase().includes(searchLower) && !card.desc.toLowerCase().includes(searchLower)) {
                        return false;
                    }
                }

                // Set — prefer the PULLED set code, fall back to card's set list
                if (filters.set !== "All") {
                    if (setCode && setCode !== "Unknown") {
                        const setInfo = card.card_sets?.find((s) => s.set_code === setCode);
                        if (setInfo?.set_name !== filters.set) return false;
                    } else {
                        const inSet = card.card_sets?.some((s) => s.set_name === filters.set);
                        if (!inSet) return false;
                    }
                }

                // Rarity — prefer the PULLED rarity, fall back to card's set list
                if (filters.rarity !== "All") {
                    if (rarity && rarity !== "Unknown") {
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
                    const cardLevel = card.level ?? (card as any).rank ?? card.linkval;
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

    const totalPages = Math.ceil(filteredCards.length / ITEMS_PER_PAGE);
    const displayedEntries = filteredCards.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    // Reset to page 1 whenever the filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filters]);

    // The rarity label shown on a tile: the pulled rarity, else the active
    // rarity filter if this card has it, else the card's first printed rarity.
    const resolveRarity = (entry: (typeof displayedEntries)[number]) => {
        const { card, rarity } = entry;
        if (rarity && rarity !== "Unknown") return rarity;
        if (filters.rarity !== "All" && card!.card_sets?.some((s) => s.set_rarity === filters.rarity)) {
            return filters.rarity;
        }
        return card!.card_sets?.[0]?.set_rarity || "Common";
    };

    if (loading && Object.keys(collection).length > 0) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-xl animate-pulse text-primary">Loading Collection...</div>
            </div>
        );
    }

    return (
        <div className="h-screen overflow-hidden grid grid-rows-[auto_auto_1fr] relative">
            <GuideSprite />

            <TopBar />

            {/* Sub-header — title, counts, and the YDK import/export/delete actions */}
            <div className="bg-wood-dark border-b-2 border-wood-border p-4 shadow-md relative z-40">
                <div className="max-w-[1920px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white leading-none">My Collection</h1>
                        <p className="text-sm text-gray-400 font-mono mt-1">{filteredCards.length} Cards Found</p>
                    </div>

                    <div className="flex gap-4">
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".ydk" className="hidden" />
                        <ParchmentButton onClick={handleImportClick}>Import YDK</ParchmentButton>
                        <ParchmentButton onClick={handleExportClick}>Export YDK</ParchmentButton>
                        <ParchmentButton
                            onClick={() => {
                                if (confirm("WARNING: This will PERMANENTLY DELETE your entire collection. This action cannot be undone. Are you sure?")) {
                                    importCollection([], "replace");
                                }
                            }}
                            className="text-red-800 hover:text-red-600 border-red-800/50"
                        >
                            Delete Collection
                        </ParchmentButton>
                    </div>
                </div>
            </div>

            {/* Scroll happens HERE (not the document), so the retro scrollbar
                sits inside the content area beneath the nav and never shifts it */}
            <div className="min-h-0 p-4 md:p-8 overflow-y-auto custom-scrollbar">
                <div className="max-w-[1920px] mx-auto flex flex-col lg:flex-row gap-6 items-start">
                    <div className="w-full lg:w-auto sticky top-4 z-30">
                        <CollectionFilters onFilterChange={setFilters} />
                    </div>

                    <StonePanel className="flex-1 w-full min-h-[80vh]">
                        {Object.keys(collection).length === 0 ? (
                            <div className="text-center py-20">
                                <h2 className="text-2xl text-gray-400 mb-4">Your collection is empty</h2>
                                <p className="text-gray-500">Open some packs to start building your collection!</p>
                                <Link
                                    href="/map"
                                    className="inline-block mt-6 px-8 py-3 bg-primary text-black font-bold rounded-lg hover:bg-primary-hover transition-colors"
                                >
                                    Go to Map
                                </Link>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9 gap-2 md:gap-4">
                                    {displayedEntries.map((entry) => (
                                        <CollectionCard
                                            key={entry.key}
                                            card={entry.card!}
                                            count={entry.count}
                                            rarity={resolveRarity(entry)}
                                            onSelect={() => setSelectedCard(entry.card!)}
                                            onHover={(e) => onHover(entry.card!, e)}
                                            onLeave={onLeave}
                                        />
                                    ))}
                                </div>

                                {totalPages > 1 && (
                                    <CollectionPagination
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                    />
                                )}
                            </>
                        )}
                    </StonePanel>
                </div>
            </div>

            {selectedCard && <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />}

            {hoveredCard && <CardTooltip card={hoveredCard} x={tooltipPosition.x} y={tooltipPosition.y} />}
        </div>
    );
}
