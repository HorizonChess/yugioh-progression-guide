"use client";

import { useProgression } from "@/context/ProgressionContext";
import GuideSprite from "@/components/shell/GuideSprite.view";
import ScaleWrapper from "@/components/DeckBuilder/ScaleWrapper.view";
import { useState, useEffect, useMemo, useRef } from "react";
import { Card, fetchCardsByIds } from "@/lib/api";
import { parseYDKWithSections, generateYDK, downloadYDK } from "@/lib/ydk-parser";
import { isExtraDeckCard, removeCardFromDeck, sortDeckCards } from "@/lib/deck-utils";
import CardInfoPanel from "@/components/DeckBuilder/CardInfoPanel.view";
import MainDeckGrid from "@/components/DeckBuilder/MainDeckGrid.view";
import SideExtraDeckGrid from "@/components/DeckBuilder/SideExtraDeckGrid.view";
import CardSearchPanel from "@/components/DeckBuilder/CardSearchPanel.view";
import LoadDeckModal from "@/components/DeckBuilder/LoadDeckModal.view";
import DragPreview from "@/components/DeckBuilder/DragPreview.view";
import DeckControls from "@/components/DeckBuilder/DeckControls.view";
import { SavedDeck } from "@/context/ProgressionContext";

export default function DeckBuilder() {
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
    const [draggedCard, setDraggedCard] = useState<Card | null>(null);
    const dragPreviewRef = useRef<{ element: HTMLDivElement | null; position: { x: number; y: number }; rafId: number | null }>({ element: null, position: { x: 0, y: 0 }, rafId: null });
    const emptyDragImageRef = useRef<HTMLImageElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragSourceRef = useRef<{ from: 'search' | 'main' | 'extra' | 'side', index: number, cardId: number } | null>(null);
    const dropOccurredRef = useRef(false);

    const updateDragPreviewPosition = (x: number, y: number) => {
        const ref = dragPreviewRef.current;
        if (ref.rafId !== null) cancelAnimationFrame(ref.rafId);
        ref.rafId = requestAnimationFrame(() => {
            if (ref.element) ref.element.style.transform = `translate3d(${x - 52.5}px, ${y - 76.5}px, 0)`;
            ref.position = { x, y };
            ref.rafId = null;
        });
    };

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

    useEffect(() => {
        const handleDocumentDragOver = (e: DragEvent) => {
            if (draggedCard) updateDragPreviewPosition(e.clientX, e.clientY);
        };
        document.addEventListener('dragover', handleDocumentDragOver);
        return () => {
            document.removeEventListener('dragover', handleDocumentDragOver);
            if (dragPreviewRef.current.rafId !== null) cancelAnimationFrame(dragPreviewRef.current.rafId);
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

    const stats = useMemo(() => {
        let monsters = 0, spells = 0, traps = 0;
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

    const handleSortDeck = () => {
        setMainDeck(sortDeckCards(mainDeck));
        setExtraDeck(sortDeckCards(extraDeck));
        setSideDeck(sortDeckCards(sideDeck));
    };

    // --- YDK Import/Export ---

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const { main, extra, side } = parseYDKWithSections(await file.text());
        if (main.length === 0 && extra.length === 0 && side.length === 0) return alert("No valid card IDs found in YDK file.");
        if ((mainDeck.length > 0 || extraDeck.length > 0 || sideDeck.length > 0) && !confirm("This will replace your current deck. Continue?")) return;

        const fetchedCards = await fetchCardsByIds([...new Set([...main, ...extra, ...side])]);
        const newAllCards = [...allCards];
        fetchedCards.forEach(card => { if (!newAllCards.find(c => c.id === card.id)) newAllCards.push(card); });
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

        const content = generateYDK({
            main: mainDeck.map(c => c.id),
            extra: extraDeck.map(c => c.id),
            side: sideDeck.map(c => c.id)
        });

        await downloadYDK(`${deckName}.ydk`, content);
    };

    // --- Persistent Hover Logic (with hover-intent) ---
    // The info panel is "sticky": it holds the last card so you can drag the
    // mouse over to scroll its description. To reach it you cross other cards,
    // which would otherwise swap the panel out from under you. Hover-intent
    // fixes that: only commit a card after the pointer RESTS on it briefly.
    // Passing over a card in transit enters+leaves faster than the delay, so
    // its pending update is cancelled and the panel keeps the last real hover.
    const HOVER_INTENT_MS = 30;
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleHover = (card: Card | null) => {
        // Any new enter/leave cancels a still-pending commit.
        if (hoverTimer.current) {
            clearTimeout(hoverTimer.current);
            hoverTimer.current = null;
        }
        // On leave (card === null) we cancel but keep the panel sticky.
        if (card) {
            hoverTimer.current = setTimeout(() => setHoveredCard(card), HOVER_INTENT_MS);
        }
    };

    // Don't leave a pending timer running after unmount.
    useEffect(() => () => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
    }, []);

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
                if (from === 'main') setMainDeck(removeCardFromDeck(mainDeck, index));
                else if (from === 'extra') setExtraDeck(removeCardFromDeck(extraDeck, index));
                else if (from === 'side') setSideDeck(removeCardFromDeck(sideDeck, index));
            }
        }

        dragSourceRef.current = null;
        dropOccurredRef.current = false;
        setDraggedCard(null);

        if (dragPreviewRef.current.rafId !== null) {
            cancelAnimationFrame(dragPreviewRef.current.rafId);
            dragPreviewRef.current.rafId = null;
        }
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
        dropOccurredRef.current = true;
        try {
            const data = JSON.parse(e.dataTransfer.getData("application/json"));
            const card = findCardById(data.cardId);
            if (!card) return;

            const isExtra = isExtraDeckCard(card);
            if (to === 'extra' && !isExtra) return alert("Only Extra Deck monsters can go in Extra Deck");
            if (to === 'main' && isExtra && data.from !== 'main') return alert("Extra Deck monsters cannot go in Main Deck");

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

    const handleRightClick = (e: React.MouseEvent, _card: Card, from: 'main' | 'extra' | 'side', index: number) => {
        e.preventDefault();
        if (from === 'main') setMainDeck(removeCardFromDeck(mainDeck, index));
        else if (from === 'extra') setExtraDeck(removeCardFromDeck(extraDeck, index));
        else if (from === 'side') setSideDeck(removeCardFromDeck(sideDeck, index));
    };

    const handleSearchDragStart = (e: React.DragEvent, card: Card) => handleDragStart(e, card, 'search');

    const handleDoubleClick = (card: Card) => {
        const isExtra = isExtraDeckCard(card);
        const deck = isExtra ? extraDeck : mainDeck;

        if (!isExtra && deck.length >= 60) return alert("Main Deck Full");
        if (isExtra && deck.length >= 15) return alert("Extra Deck Full");
        if (getCopiesInAllDecks(card.id) >= 3) return alert("Max 3 copies allowed.");
        if ((collectionCards.find(entry => entry.card.id === card.id)?.count || 0) <= 0) return;

        if (isExtra) setExtraDeck([...extraDeck, card]);
        else setMainDeck([...mainDeck, card]);
    };

    return (
        <>
        <ScaleWrapper backgroundColor="#0f172a">
            <div className="flex flex-col h-full w-full bg-slate-900 text-slate-100 overflow-hidden">
            {/* The nav is hoisted to the root layout above ScaleWrapper, so it's
                no longer scaled with the board. */}
            <div className="flex flex-1 px-1 pt-1 pb-1 gap-1 overflow-hidden relative min-h-0">

                {/* Left Column: Info + Controls */}
                <div className="w-[300px] shrink-0 flex flex-col min-h-0 bg-wood-dark border-r-2 border-wood-border">
                    {/* Card Info - Can shrink and scroll if needed */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <CardInfoPanel card={hoveredCard} />
                    </div>

                    <DeckControls
                        deckName={deckName}
                        onDeckNameChange={setDeckName}
                        onSave={handleSaveDeck}
                        onLoad={() => setShowLoadModal(true)}
                        onClear={handleClearDeck}
                        onSort={handleSortDeck}
                        onImport={handleImportClick}
                        onExport={handleExportClick}
                    />
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
                <div className="w-[280px] shrink-0 flex flex-col bg-lime rounded-lg border-4 border-olive shadow-xl overflow-hidden min-h-0">
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

            {showLoadModal && (
                <LoadDeckModal
                    savedDecks={savedDecks}
                    onLoad={handleLoadDeck}
                    onDelete={handleDeleteDeck}
                    onClose={() => setShowLoadModal(false)}
                />
            )}

            </div>
        </ScaleWrapper>

        {draggedCard && <DragPreview card={draggedCard} previewRef={dragPreviewRef} />}
        </>
    );
}
