"use client";

import { useProgression } from "@/context/ProgressionContext";
import TopBar from "@/components/TopBar";
import GuideSprite from "@/components/GuideSprite";
import { useState, useEffect, useMemo } from "react";
import { Card, fetchCardsByIds } from "@/lib/api";
import CardInfoPanel from "@/components/DeckBuilder/CardInfoPanel";
import DeckGrid from "@/components/DeckBuilder/DeckGrid";
import CardSearchPanel from "@/components/DeckBuilder/CardSearchPanel";
import { SavedDeck } from "@/context/ProgressionContext";

export default function DeckBuilderPage() {
    const { collection, saveDeck, savedDecks, deleteDeck } = useProgression();
    const [allCards, setAllCards] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredCard, setHoveredCard] = useState<Card | null>(null);

    // Deck State
    const [mainDeck, setMainDeck] = useState<Card[]>([]);
    const [extraDeck, setExtraDeck] = useState<Card[]>([]);
    const [sideDeck, setSideDeck] = useState<Card[]>([]);

    const [deckName, setDeckName] = useState("New Deck");
    const [showLoadModal, setShowLoadModal] = useState(false);

    useEffect(() => {
        async function loadCollection() {
            setLoading(true);
            const uniqueIds = new Set<number>();
            Object.keys(collection).forEach(key => {
                const [idStr] = key.split('_');
                const id = parseInt(idStr);
                if (!isNaN(id)) uniqueIds.add(id);
            });

            if (uniqueIds.size > 0) {
                const fetchedCards = await fetchCardsByIds(Array.from(uniqueIds));
                setAllCards(fetchedCards);
            }
            setLoading(false);
        }
        loadCollection();
    }, [collection]);

    const collectionCards = useMemo(() => {
        const counts = new Map<number, number>();
        Object.entries(collection).forEach(([key, count]) => {
            const [idStr] = key.split('_');
            const id = parseInt(idStr);
            counts.set(id, (counts.get(id) || 0) + count);
        });
        [...mainDeck, ...extraDeck, ...sideDeck].forEach(card => {
            const current = counts.get(card.id) || 0;
            counts.set(card.id, Math.max(0, current - 1));
        });
        return allCards.map(card => ({
            card,
            count: counts.get(card.id) || 0
        })).filter(entry => entry.count > 0);
    }, [allCards, collection, mainDeck, extraDeck, sideDeck]);

    // --- Stats Calculation ---
    const stats = useMemo(() => {
        let monsters = 0;
        let spells = 0;
        let traps = 0;

        mainDeck.forEach(c => {
            if (c.type.includes("Monster")) monsters++;
            else if (c.type.includes("Spell")) spells++;
            else if (c.type.includes("Trap")) traps++;
        });

        return { monsters, spells, traps, total: mainDeck.length };
    }, [mainDeck]);

    const handleSaveDeck = () => {
        if (!deckName.trim()) return alert("Please enter a deck name.");
        // Deck Validation: Warn if < 40 but verify save desire
        if (mainDeck.length < 40) {
            if (!confirm("Main Deck is under 40 cards. Save anyway?")) return;
        }

        const deckData: SavedDeck = {
            id: crypto.randomUUID(),
            name: deckName,
            mainDeck: mainDeck.map(c => c.id),
            extraDeck: extraDeck.map(c => c.id),
            sideDeck: sideDeck.map(c => c.id),
            createdAt: Date.now()
        };

        const existing = savedDecks.find(d => d.name === deckName);
        if (existing) {
            if (!confirm(`Overwrite existing deck "${deckName}"?`)) return;
            deckData.id = existing.id;
        }

        saveDeck(deckData);
        alert("Deck Saved!");
    };

    const handleLoadDeck = (deck: SavedDeck) => {
        if (!deck) return;
        setDeckName(deck.name);
        const getCards = (ids: number[]) => ids.map(id => allCards.find(c => c.id === id)).filter(Boolean) as Card[];
        setMainDeck(getCards(deck.mainDeck));
        setExtraDeck(getCards(deck.extraDeck));
        setSideDeck(getCards(deck.sideDeck));
        setShowLoadModal(false);
        alert(`Loaded "${deck.name}"`);
    };

    const handleDeleteDeck = (id: string) => {
        if (confirm("Delete this deck?")) deleteDeck(id);
    };

    // --- Drag and Drop Logic ---

    const getCopiesInAllDecks = (cardId: number) => {
        const countIn = (deck: Card[]) => deck.filter(c => c.id === cardId).length;
        return countIn(mainDeck) + countIn(extraDeck) + countIn(sideDeck);
    };

    const handleDragStart = (e: React.DragEvent, card: Card, from: 'search' | 'main' | 'extra' | 'side', index?: number) => {
        const data = { cardId: card.id, from, index };
        e.dataTransfer.setData("application/json", JSON.stringify(data));
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDrop = (e: React.DragEvent, to: 'main' | 'extra' | 'side', index: number) => {
        e.preventDefault();
        try {
            const data = JSON.parse(e.dataTransfer.getData("application/json"));
            const card = allCards.find(c => c.id === data.cardId);
            if (!card) return;

            const getDeck = (zone: string) => {
                if (zone === 'side') return sideDeck;
                if (zone === 'extra') return extraDeck;
                return mainDeck;
            };
            const setDeck = (zone: string, newDeck: Card[]) => {
                if (zone === 'side') setSideDeck(newDeck);
                else if (zone === 'extra') setExtraDeck(newDeck);
                else setMainDeck(newDeck);
            };

            const sourceDeck = getDeck(data.from);
            const targetDeck = getDeck(to);

            if (to === 'main' && targetDeck.length >= 60 && data.from !== 'main') return alert("Main Deck Full (Max 60)");
            if ((to === 'extra' || to === 'side') && targetDeck.length >= 15 && data.from !== to) return alert("Extra/Side Deck Full (Max 15)");

            if (data.from === 'search') {
                if (getCopiesInAllDecks(card.id) >= 3) return alert("Max 3 copies allowed.");
            }

            if (data.from !== 'search') {
                const newSource = [...sourceDeck];
                newSource.splice(data.index, 1);
                setDeck(data.from, newSource);
            } else {
                const available = collectionCards.find(entry => entry.card.id === card.id)?.count || 0;
                if (available <= 0) return;
            }

            const newTarget = (data.from === to && data.from !== 'search') ? [...sourceDeck] : [...targetDeck];

            if (data.from === to) {
                const d = [...sourceDeck];
                d.splice(data.index, 1);
                d.splice(index, 0, card);
                setDeck(to, d);
                return;
            }

            newTarget.splice(index, 0, card);
            setDeck(to, newTarget);

        } catch (err) {
            console.error("Drop failed", err);
        }
    };

    const handleRightClick = (e: React.MouseEvent, card: Card, from: 'main' | 'extra' | 'side', index: number) => {
        e.preventDefault();
        if (from === 'main') {
            const newDeck = [...mainDeck];
            newDeck.splice(index, 1);
            setMainDeck(newDeck);
        } else if (from === 'extra') {
            const newDeck = [...extraDeck];
            newDeck.splice(index, 1);
            setExtraDeck(newDeck);
        } else if (from === 'side') {
            const newDeck = [...sideDeck];
            newDeck.splice(index, 1);
            setSideDeck(newDeck);
        }
    };

    const handleSearchDragStart = (e: React.DragEvent, card: Card) => {
        handleDragStart(e, card, 'search');
    };

    const handleDoubleClick = (card: Card) => {
        const isExtra = card.type.includes("Fusion") || card.type.includes("Synchro") || card.type.includes("XYZ") || card.type.includes("Link");
        const targetZone = isExtra ? 'extra' : 'main';
        const deck = targetZone === 'extra' ? extraDeck : mainDeck;

        if (targetZone === 'main' && deck.length >= 60) return alert("Main Deck Full");
        if (targetZone === 'extra' && deck.length >= 15) return alert("Extra Deck Full");
        if (getCopiesInAllDecks(card.id) >= 3) return alert("Max 3 copies allowed.");

        const available = collectionCards.find(entry => entry.card.id === card.id)?.count || 0;
        if (available <= 0) return;

        if (targetZone === 'extra') setExtraDeck([...extraDeck, card]);
        else setMainDeck([...mainDeck, card]);
    };

    return (
        <div className="flex flex-col h-screen bg-slate-900 text-slate-100 overflow-hidden font-mono">
            <TopBar />
            <div className="flex flex-1 p-2 gap-2 overflow-hidden relative">

                {/* Left: Card Info */}
                <div className="flex-1 min-w-[300px] max-w-[350px] shrink-0 border-r border-[#8b7355]/50">
                    <CardInfoPanel card={hoveredCard} />
                </div>

                {/* Center: Deck View */}
                <div className="flex-[2] flex flex-col gap-2 min-w-0">
                    {/* Controls */}
                    <div className="flex justify-between items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
                        <div className="flex gap-2 items-center flex-1">
                            <input
                                value={deckName}
                                onChange={(e) => setDeckName(e.target.value)}
                                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 flex-1 max-w-xs text-amber-400 font-bold"
                                placeholder="Deck Name"
                            />
                            <button onClick={handleSaveDeck} className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded font-bold transition-colors border border-green-700 shadow text-xs">SAVE</button>
                            <button onClick={() => setShowLoadModal(true)} className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded font-bold transition-colors border border-blue-700 shadow text-xs">LOAD</button>
                            <button onClick={() => { setMainDeck([]); setExtraDeck([]); setSideDeck([]); }} className="bg-red-600 hover:bg-red-500 px-3 py-1 rounded font-bold transition-colors border border-red-700 shadow text-xs">CLEAR</button>
                        </div>
                    </div>

                    {/* Deck Grid + Stats integrated */}
                    <div className="flex-1 overflow-hidden bg-slate-800/80 rounded border border-slate-600 shadow-inner p-1">
                        <DeckGrid
                            mainDeck={mainDeck}
                            extraDeck={extraDeck}
                            sideDeck={sideDeck}
                            stats={stats}
                            onDrop={handleDrop}
                            onDragStart={handleDragStart}
                            onRightClick={handleRightClick}
                            onHover={setHoveredCard}
                        />
                    </div>
                </div>

                {/* Right: Search Panel */}
                <div className="flex-1 min-w-[300px] max-w-[350px] shrink-0 flex flex-col bg-[#99cc00] rounded-lg border-4 border-[#666600] shadow-xl overflow-hidden">
                    <CardSearchPanel
                        collectionCards={collectionCards}
                        onDragStart={handleSearchDragStart}
                        onHover={setHoveredCard}
                        onCardDoubleClick={handleDoubleClick}
                    />
                </div>

            </div>

            <GuideSprite />

            {/* Load Modal */}
            {showLoadModal && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border-2 border-slate-500 rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <h2 className="text-2xl font-bold mb-4 text-amber-400 font-russo">Load Deck</h2>
                        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto custom-scrollbar p-1">
                            {savedDecks.length === 0 && <p className="text-gray-400 italic text-center">No saved decks found.</p>}
                            {savedDecks.map(deck => {
                                const isInvalid = deck.mainDeck.length < 40;
                                return (
                                    <div key={deck.id} className="flex justify-between items-center bg-slate-900 border border-slate-700 p-2 rounded hover:bg-slate-700 transition-colors group">
                                        <button
                                            className="flex-1 text-left"
                                            onClick={() => handleLoadDeck(deck)}
                                        >
                                            <div className={`font-bold ${isInvalid ? 'text-red-500' : 'text-white'}`}>
                                                {deck.name}
                                            </div>
                                            <span className="text-xs text-gray-400">
                                                {new Date(deck.createdAt).toLocaleDateString()} | {deck.mainDeck.length} Cards
                                            </span>
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteDeck(deck.id); }}
                                            className="bg-red-900/50 hover:bg-red-600 text-red-200 p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            DELETE
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                        <button onClick={() => setShowLoadModal(false)} className="mt-4 w-full bg-slate-700 hover:bg-slate-600 py-2 rounded font-bold border border-slate-500">CANCEL</button>
                    </div>
                </div>
            )}

        </div>
    );
}
