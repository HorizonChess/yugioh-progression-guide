"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchCardsByIds, Card } from "@/lib/api";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import CardDetailModal from "@/components/CardDetailModal";
import CollectionFilters, { FilterState } from "@/components/CollectionFilters";
import TopBar from "@/components/TopBar";
import SaveSlotList from "@/components/SaveSlotList";

export default function CollectionPage() {
    const { collection, activeSaveId, loadSave } = useProgression();
    const [cards, setCards] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 60;

    const [filters, setFilters] = useState<FilterState>({
        search: "",
        cardType: "All",
        attribute: "All",
        monsterType: "All",
        sort: "name_asc"
    });

    useEffect(() => {
        async function loadCollection() {
            if (!activeSaveId) {
                setLoading(false);
                return;
            }

            setLoading(true);
            const ids = Object.keys(collection).map(Number);
            if (ids.length > 0) {
                const fetchedCards = await fetchCardsByIds(ids);
                setCards(fetchedCards);
            } else {
                setCards([]);
            }
            setLoading(false);
        }
        loadCollection();
    }, [collection, activeSaveId]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filters]);

    // Filter & Sort Logic
    const filteredCards = useMemo(() => {
        let result = cards.filter(card => {
            // Search (Name or Desc)
            if (filters.search) {
                const term = filters.search.toLowerCase();
                const matchName = card.name.toLowerCase().includes(term);
                const matchDesc = card.desc.toLowerCase().includes(term);
                if (!matchName && !matchDesc) return false;
            }

            // Card Type
            if (filters.cardType !== "All") {
                if (filters.cardType === "Monster") {
                    if (card.type.includes("Spell") || card.type.includes("Trap")) return false;
                } else if (filters.cardType === "Spell") {
                    if (!card.type.includes("Spell")) return false;
                } else if (filters.cardType === "Trap") {
                    if (!card.type.includes("Trap")) return false;
                }
            }

            // Attribute (Monsters only)
            if (filters.attribute !== "All") {
                if (card.attribute !== filters.attribute) return false;
            }

            // Monster Type (Race)
            if (filters.monsterType !== "All") {
                if (card.race !== filters.monsterType) return false;
            }

            return true;
        });

        // Sorting
        return result.sort((a, b) => {
            switch (filters.sort) {
                case "name_asc":
                    return a.name.localeCompare(b.name);
                case "name_desc":
                    return b.name.localeCompare(a.name);
                case "atk_desc":
                    return (b.atk || 0) - (a.atk || 0);
                case "def_desc":
                    return (b.def || 0) - (a.def || 0);
                case "level_desc":
                    return (b.level || 0) - (a.level || 0);
                case "newest":
                    return b.id - a.id;
                case "oldest":
                    return a.id - b.id;
                default:
                    return 0;
            }
        });
    }, [cards, filters]);

    // Pagination
    const totalPages = Math.ceil(filteredCards.length / ITEMS_PER_PAGE);
    const displayedCards = filteredCards.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // If no save is active, show save selection
    if (!activeSaveId) {
        return (
            <div className="min-h-screen text-white flex flex-col">
                <TopBar />
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                    <div className="max-w-md w-full">
                        <h1 className="text-3xl font-bold mb-8 text-center text-[var(--primary)]">Select Collection</h1>
                        <SaveSlotList onSaveSelect={(id) => loadSave(id)} />
                        <div className="mt-8 text-center">
                            <Link href="/menu" className="text-gray-500 hover:text-white transition-colors">
                                Cancel & Return to Menu
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-xl animate-pulse text-[var(--primary)]">Loading Collection...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col">
            <TopBar />
            <div className="flex-1 p-8">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between mb-8">
                        <h1 className="text-3xl font-bold text-white">My Collection</h1>
                        {/* TopBar handles navigation, but we can keep a breadcrumb or specific action if needed */}
                    </div>

                    <CollectionFilters onFilterChange={setFilters} />

                    <div className="mb-4 flex justify-between items-center text-gray-400 text-sm">
                        <span>Showing {filteredCards.length} cards</span>
                        {totalPages > 1 && (
                            <span>Page {currentPage} of {totalPages}</span>
                        )}
                    </div>

                    {cards.length === 0 ? (
                        <div className="text-center py-20 border-2 border-dashed border-[var(--border)] rounded-xl bg-white/5">
                            <div className="text-6xl mb-4">🎴</div>
                            <h2 className="text-2xl font-bold mb-2">Collection Empty</h2>
                            <p className="text-gray-400">Open some packs to start your collection!</p>
                            <Link
                                href="/map"
                                className="inline-block mt-4 px-6 py-2 bg-[var(--primary)] text-black font-bold rounded-lg hover:bg-[var(--primary-hover)] transition-colors"
                            >
                                Go to Campaign Map
                            </Link>
                        </div>
                    ) : filteredCards.length === 0 ? (
                        <div className="text-center py-20">
                            <p className="text-gray-400 text-xl">No cards match your filters.</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                {displayedCards.map((card) => (
                                    <div
                                        key={card.id}
                                        className="relative group aspect-[59/86] cursor-pointer transition-transform hover:scale-105 hover:z-10"
                                        onClick={() => setSelectedCard(card)}
                                    >
                                        <img
                                            src={card.card_images[0].image_url}
                                            alt={card.name}
                                            className="w-full h-full object-contain rounded-lg shadow-lg"
                                            loading="lazy"
                                        />
                                        <div className="absolute bottom-0 right-0 bg-black/80 text-white px-2 py-1 rounded-tl-lg font-bold border-t border-l border-white/20">
                                            x{collection[card.id]}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="flex justify-center items-center gap-4 mt-8">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="px-4 py-2 bg-black/50 border border-gray-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--primary)] hover:text-black transition-colors"
                                    >
                                        Previous
                                    </button>
                                    <span className="text-white font-bold">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-4 py-2 bg-black/50 border border-gray-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--primary)] hover:text-black transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {selectedCard && (
                    <CardDetailModal
                        card={selectedCard}
                        onClose={() => setSelectedCard(null)}
                    />
                )}
            </div>
        </div>
    );
}
