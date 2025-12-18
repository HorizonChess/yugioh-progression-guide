"use client";

import { useProgression } from "@/context/ProgressionContext";
import TopBar from "@/components/TopBar";
import GuideSprite from "@/components/GuideSprite";
import ScaleWrapper from "@/components/ScaleWrapper";
import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Card, fetchCardsByIds } from "@/lib/api";
import CardInfoPanel from "@/components/DeckBuilder/CardInfoPanel";
import MainDeckGrid from "@/components/DeckBuilder/MainDeckGrid";
import SideExtraDeckGrid from "@/components/DeckBuilder/SideExtraDeckGrid";
import CardSearchPanel from "@/components/DeckBuilder/CardSearchPanel";
import { SavedDeck } from "@/context/ProgressionContext";

export default function DeckBuilderPage() {
    const { collection, saveDeck, savedDecks, deleteDeck } = useProgression();
    const [allCards, setAllCards] = useState<Card[]>([]);
    const [, setLoading] = useState(true);
    const [hoveredCard, setHoveredCard] = useState<Card | null>(null);

    // Deck State
    const [mainDeck, setMainDeck] = useState<Card[]>([]);
    const [extraDeck, setExtraDeck] = useState<Card[]>([]);
    const [sideDeck, setSideDeck] = useState<Card[]>([]);

    const [deckName, setDeckName] = useState("New Deck");
    const [showLoadModal, setShowLoadModal] = useState(false);

    // Drag Preview State
    // Minimal state - only controls show/hide
    const [draggedCard, setDraggedCard] = useState<Card | null>(null);

    // Ref for position updates without re-renders
    const dragPreviewRef = useRef<{
        element: HTMLDivElement | null;
        position: { x: number; y: number };
        rafId: number | null;
    }>({
        element: null,
        position: { x: 0, y: 0 },
        rafId: null
    });

    // Ref for preloaded empty drag image (prevents ghost image on first drag)
    const emptyDragImageRef = useRef<HTMLImageElement | null>(null);

    // Ref for YDK file import
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Ref for tracking drag source (for drag-to-remove)
    const dragSourceRef = useRef<{ from: 'search' | 'main' | 'extra' | 'side', index: number, cardId: number } | null>(null);
    const dropOccurredRef = useRef(false);

    // Update preview position via direct DOM manipulation
    const updateDragPreviewPosition = (x: number, y: number) => {
        const ref = dragPreviewRef.current;

        // Cancel pending animation frame
        if (ref.rafId !== null) {
            cancelAnimationFrame(ref.rafId);
        }

        // Schedule update on next frame
        ref.rafId = requestAnimationFrame(() => {
            if (ref.element) {
                // Center card on cursor
                const offsetX = x - 52.5;
                const offsetY = y - 76.5;

                // GPU-accelerated positioning
                ref.element.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
            }

            ref.position = { x, y };
            ref.rafId = null;
        });
    };

    // Preload empty drag image to prevent ghost on first drag
    useEffect(() => {
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        emptyDragImageRef.current = img;
    }, []);

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

    // Firefox fallback: use document dragover for cursor tracking
    useEffect(() => {
        const handleDocumentDragOver = (e: DragEvent) => {
            if (draggedCard) {
                updateDragPreviewPosition(e.clientX, e.clientY);
            }
        };

        document.addEventListener('dragover', handleDocumentDragOver);
        return () => {
            document.removeEventListener('dragover', handleDocumentDragOver);
            // Clean up pending animation frame
            if (dragPreviewRef.current.rafId !== null) {
                cancelAnimationFrame(dragPreviewRef.current.rafId);
            }
        };
    }, [draggedCard]);

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
        }));
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

    // --- Actions ---
    const handleSaveDeck = () => {
        if (!deckName.trim()) return alert("Please enter a deck name.");
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

    const handleLoadDeck = async (deck: SavedDeck) => {
        if (!deck) return;
        setDeckName(deck.name);

        // Get all unique IDs from the deck
        const allDeckIds = [...new Set([...deck.mainDeck, ...deck.extraDeck, ...deck.sideDeck])];

        // Find which IDs are not in allCards
        const missingIds = allDeckIds.filter(id => !allCards.find(c => c.id === id));

        // Fetch missing cards and combine with existing
        let cardsToUse = allCards;
        if (missingIds.length > 0) {
            const fetchedCards = await fetchCardsByIds(missingIds);
            cardsToUse = [...allCards, ...fetchedCards];
            // Update allCards state so future operations work
            setAllCards(cardsToUse);
        }

        const getCards = (ids: number[]) => ids.map(id => cardsToUse.find(c => c.id === id)).filter(Boolean) as Card[];
        setMainDeck(getCards(deck.mainDeck));
        setExtraDeck(getCards(deck.extraDeck));
        setSideDeck(getCards(deck.sideDeck));
        setShowLoadModal(false);
        alert(`Loaded "${deck.name}"`);
    };

    const handleDeleteDeck = (id: string) => {
        if (confirm("Delete this deck?")) deleteDeck(id);
    };

    const handleClearDeck = () => {
        if (confirm("Clear current deck?")) {
            setMainDeck([]);
            setExtraDeck([]);
            setSideDeck([]);
        }
    }

    // Sort function: Monsters → Spells → Traps, alphabetically within each category
    const handleSortDeck = () => {
        const sortCards = (cards: Card[]) => {
            return [...cards].sort((a, b) => {
                // Determine category: 0 = Monster, 1 = Spell, 2 = Trap
                const getCategory = (card: Card) => {
                    if (card.type.includes("Spell")) return 1;
                    if (card.type.includes("Trap")) return 2;
                    return 0; // Monster (includes all monster types)
                };

                const catA = getCategory(a);
                const catB = getCategory(b);

                // Sort by category first
                if (catA !== catB) return catA - catB;

                // Then alphabetically by name
                return a.name.localeCompare(b.name);
            });
        };

        setMainDeck(sortCards(mainDeck));
        setExtraDeck(sortCards(extraDeck));
        setSideDeck(sortCards(sideDeck));
    };

    // --- YDK Import/Export ---

    // Helper to parse YDK with sections
    const parseYDKWithSections = (content: string): { main: number[], extra: number[], side: number[] } => {
        const lines = content.split(/\r?\n/);
        const result = { main: [] as number[], extra: [] as number[], side: [] as number[] };
        let currentSection: 'main' | 'extra' | 'side' = 'main';

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '#main') { currentSection = 'main'; continue; }
            if (trimmed === '#extra') { currentSection = 'extra'; continue; }
            if (trimmed === '!side') { currentSection = 'side'; continue; }
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;

            const id = parseInt(trimmed, 10);
            if (!isNaN(id)) result[currentSection].push(id);
        }
        return result;
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const text = await file.text();
        const { main, extra, side } = parseYDKWithSections(text);

        if (main.length === 0 && extra.length === 0 && side.length === 0) {
            alert("No valid card IDs found in YDK file.");
            return;
        }

        // Confirm before replacing current deck
        if (mainDeck.length > 0 || extraDeck.length > 0 || sideDeck.length > 0) {
            if (!confirm("This will replace your current deck. Continue?")) return;
        }

        // Fetch card data and populate decks
        const allIds = [...new Set([...main, ...extra, ...side])];
        const fetchedCards = await fetchCardsByIds(allIds);

        // Update allCards with fetched cards so drag/drop works
        const newAllCards = [...allCards];
        fetchedCards.forEach(card => {
            if (!newAllCards.find(c => c.id === card.id)) {
                newAllCards.push(card);
            }
        });
        setAllCards(newAllCards);

        const getCards = (ids: number[]) =>
            ids.map(id => fetchedCards.find(c => c.id === id)).filter(Boolean) as Card[];

        setMainDeck(getCards(main));
        setExtraDeck(getCards(extra));
        setSideDeck(getCards(side));

        alert(`Imported deck: ${main.length} main, ${extra.length} extra, ${side.length} side`);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleExportClick = async () => {
        if (mainDeck.length === 0 && extraDeck.length === 0 && sideDeck.length === 0) {
            alert("Deck is empty. Nothing to export.");
            return;
        }

        // Generate YDK content with proper sections
        const lines = ['#created by Progression Series Guide', '#main'];
        mainDeck.forEach(card => lines.push(card.id.toString()));
        lines.push('#extra');
        extraDeck.forEach(card => lines.push(card.id.toString()));
        lines.push('!side');
        sideDeck.forEach(card => lines.push(card.id.toString()));

        const content = lines.join('\n');
        const contentWithBOM = '\uFEFF' + content;
        const blob = new Blob([contentWithBOM], { type: 'text/plain;charset=utf-8' });

        // Use File System Access API if available
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await (window as any).showSaveFilePicker({
                    suggestedName: `${deckName}.ydk`,
                    types: [{ description: 'YDK File', accept: { 'text/plain': ['.ydk'] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                return;
            } catch (err) {
                if ((err as Error).name === 'AbortError') return;
            }
        }

        // Fallback: blob URL download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${deckName}.ydk`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);
    };

    // --- Persistent Hover Logic ---
    const handleHover = (card: Card | null) => {
        if (card) {
            setHoveredCard(card);
        }
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

        // Track drag source for drag-to-remove
        dragSourceRef.current = { from, index: index ?? -1, cardId: card.id };
        dropOccurredRef.current = false;

        // Use preloaded empty drag image
        if (emptyDragImageRef.current) {
            e.dataTransfer.setDragImage(emptyDragImageRef.current, 0, 0);
        }

        // Set position in ref BEFORE mounting component (prevents flicker)
        dragPreviewRef.current.position = { x: e.clientX, y: e.clientY };

        // Show custom preview (state triggers mount, will use position from ref)
        setDraggedCard(card);
    };

    const handleDrag = (e: React.DragEvent) => {
        // Firefox doesn't provide coordinates in drag event
        // Fall back to dragover handler for Firefox
        if (e.clientX === 0 && e.clientY === 0) return;

        updateDragPreviewPosition(e.clientX, e.clientY);
    };

    const handleDragEnd = () => {
        // Drag-to-remove: if no valid drop occurred and card came from a deck, remove it
        if (!dropOccurredRef.current && dragSourceRef.current) {
            const { from, index } = dragSourceRef.current;
            if (from !== 'search' && index >= 0) {
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
            }
        }

        // Reset drag tracking
        dragSourceRef.current = null;
        dropOccurredRef.current = false;

        // Hide preview (triggers unmount)
        setDraggedCard(null);

        // Cancel pending animation frame
        if (dragPreviewRef.current.rafId !== null) {
            cancelAnimationFrame(dragPreviewRef.current.rafId);
            dragPreviewRef.current.rafId = null;
        }

        // Reset position for next drag
        dragPreviewRef.current.position = { x: 0, y: 0 };
    };

    // Helper to find card by ID - searches allCards and current decks
    const findCardById = (cardId: number): Card | undefined => {
        return allCards.find(c => c.id === cardId)
            || mainDeck.find(c => c.id === cardId)
            || extraDeck.find(c => c.id === cardId)
            || sideDeck.find(c => c.id === cardId);
    };

    const handleDrop = (e: React.DragEvent, to: 'main' | 'extra' | 'side', index: number) => {
        e.preventDefault();
        // Mark that a valid drop occurred (prevents drag-to-remove)
        dropOccurredRef.current = true;
        try {
            const data = JSON.parse(e.dataTransfer.getData("application/json"));
            const card = findCardById(data.cardId);
            if (!card) return;

            // Validate card type for Extra Deck
            const isExtraCard = card.type.includes("Fusion") ||
                                card.type.includes("Synchro") ||
                                card.type.includes("XYZ") ||
                                card.type.includes("Link");

            if (to === 'extra' && !isExtraCard) {
                return alert("Only Extra Deck monsters can go in Extra Deck");
            }
            if (to === 'main' && isExtraCard && data.from !== 'main') {
                return alert("Extra Deck monsters cannot go in Main Deck");
            }

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
            console.error("Drop failed:", err);
        } finally {
            // ALWAYS cleanup drag state, even if drop fails
            setDraggedCard(null);
            if (dragPreviewRef.current.rafId !== null) {
                cancelAnimationFrame(dragPreviewRef.current.rafId);
                dragPreviewRef.current.rafId = null;
            }
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
        <>
        <ScaleWrapper backgroundColor="#0f172a">
            <div className="flex flex-col h-full w-full bg-slate-900 text-slate-100 overflow-hidden">
                    <TopBar />
            <div className="flex flex-1 px-1 pt-1 pb-1 gap-1 overflow-hidden relative min-h-0">

                {/* Left Column: Info + Controls */}
                <div className="w-[300px] shrink-0 flex flex-col min-h-0 bg-[#1a120b] border-r-2 border-[#8b7355]">
                    {/* Card Info - Can shrink and scroll if needed */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <CardInfoPanel card={hoveredCard} />
                    </div>

                    {/* Deck Controls - Fixed at bottom */}
                    <div className="shrink-0 bg-[#2d2d2d] border border-gray-600 rounded m-1 p-2 flex flex-col gap-2 text-xs">
                        <div className="flex gap-1">
                            <input
                                value={deckName}
                                onChange={(e) => setDeckName(e.target.value)}
                                className="bg-black/50 border border-gray-500 rounded px-2 py-1 flex-1 text-white font-bold"
                                placeholder="Deck Name"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            <button onClick={handleSaveDeck} className="bg-gradient-to-b from-gray-200 to-gray-400 text-black border border-gray-600 rounded shadow font-bold hover:brightness-110 py-1">Save Deck</button>
                            <button onClick={() => setShowLoadModal(true)} className="bg-gradient-to-b from-gray-200 to-gray-400 text-black border border-gray-600 rounded shadow font-bold hover:brightness-110 py-1">Load Deck</button>
                            <button onClick={handleClearDeck} className="bg-gradient-to-b from-gray-200 to-gray-400 text-black border border-gray-600 rounded shadow font-bold hover:brightness-110 py-1">Clear Deck</button>
                            <button onClick={handleSortDeck} className="bg-gradient-to-b from-gray-200 to-gray-400 text-black border border-gray-600 rounded shadow font-bold hover:brightness-110 py-1">Sort</button>
                            <button onClick={handleImportClick} className="bg-gradient-to-b from-gray-200 to-gray-400 text-black border border-gray-600 rounded shadow font-bold hover:brightness-110 py-1">Import</button>
                            <button onClick={handleExportClick} className="bg-gradient-to-b from-gray-200 to-gray-400 text-black border border-gray-600 rounded shadow font-bold hover:brightness-110 py-1">Export</button>
                        </div>
                    </div>
                </div>

                {/* Center: Main Deck */}
                <div className="flex-[3] min-w-0 min-h-0 bg-slate-800/50 rounded border border-slate-700 p-1">
                    <MainDeckGrid
                        mainDeck={mainDeck}
                        stats={stats}
                        onDrop={handleDrop}
                        onDragStart={handleDragStart}
                        onDrag={handleDrag}
                        onDragEnd={handleDragEnd}
                        onRightClick={handleRightClick}
                        onHover={handleHover}
                    />
                </div>

                {/* Side/Extra Decks */}
                <div className="w-[240px] shrink-0 min-h-0 bg-slate-800/50 rounded border border-slate-700 p-1">
                    <SideExtraDeckGrid
                        sideDeck={sideDeck}
                        extraDeck={extraDeck}
                        onDrop={handleDrop}
                        onDragStart={handleDragStart}
                        onDrag={handleDrag}
                        onDragEnd={handleDragEnd}
                        onRightClick={handleRightClick}
                        onHover={handleHover}
                    />
                </div>

                {/* Right: Search Panel */}
                <div className="w-[280px] shrink-0 flex flex-col bg-[#99cc00] rounded-lg border-4 border-[#666600] shadow-xl overflow-hidden min-h-0">
                    <CardSearchPanel
                        collectionCards={collectionCards}
                        onDragStart={handleSearchDragStart}
                        onDrag={handleDrag}
                        onDragEnd={handleDragEnd}
                        onHover={handleHover}
                        onCardDoubleClick={handleDoubleClick}
                    />
                </div>

            </div>

            <GuideSprite />

            {/* Hidden file input for YDK import */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".ydk"
                className="hidden"
            />

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

            </div> {/* End of h-full content div */}
        </ScaleWrapper>

        {/* Floating Drag Preview - Rendered via Portal OUTSIDE ScaleWrapper
            This fixes the offset issue caused by CSS transform creating a new containing block
            for position:fixed elements. By portaling to document.body, the preview uses
            actual viewport coordinates instead of the scaled container coordinates. */}
        {draggedCard && typeof document !== 'undefined' && createPortal(
            <div
                ref={(el) => {
                    dragPreviewRef.current.element = el;
                }}
                style={{
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    width: '105px',
                    height: '153px',
                    pointerEvents: 'none',
                    zIndex: 9999,
                    // Apply initial transform from ref (prevents flicker at top-left)
                    transform: `translate3d(${dragPreviewRef.current.position.x - 52.5}px, ${dragPreviewRef.current.position.y - 76.5}px, 0)`,
                    willChange: 'transform',
                }}
                className="opacity-100 transition-none"
            >
                <img
                    src={draggedCard.card_images[0].image_url}
                    alt={draggedCard.name}
                    className="w-full h-full object-fill rounded-[4px]"
                    style={{
                        filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.6))',
                        imageRendering: 'crisp-edges'
                    }}
                />
            </div>,
            document.body
        )}
        </>
    );
}
