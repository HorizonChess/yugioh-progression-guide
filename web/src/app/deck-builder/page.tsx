"use client";

import { useProgression, SavedDeck } from "@/context/ProgressionContext";
import GuideSprite from "@/components/layout/GuideSprite";
import ScaleWrapper from "@/components/deck-builder/ScaleWrapper";
import { useState, useEffect, useMemo, useRef } from "react";
import { Card, fetchCardsByIds } from "@/lib/api";
import { parseYDKWithSections, generateYDK, downloadYDK } from "@/lib/ydk-parser";
import {
    isExtraDeckCard,
    removeCardFromDeck,
    sortDeckCards,
    parseDragPayload,
    DRAG_MIME,
    DeckZone,
    DragSource,
    DragPayload,
} from "@/lib/deck-utils";
import { ownedCardIds, ownedCountsById } from "@/lib/collection";
import { isDefined } from "@/lib/utils";
import CardInfoPanel from "@/components/deck-builder/CardInfoPanel";
import MainDeckGrid from "@/components/deck-builder/MainDeckGrid";
import SideExtraDeckGrid from "@/components/deck-builder/SideExtraDeckGrid";
import CardSearchPanel from "@/components/deck-builder/CardSearchPanel";
import LoadDeckModal from "@/components/deck-builder/LoadDeckModal";
import DragPreview, { DragPreviewHandle, dragPreviewTransform } from "@/components/deck-builder/DragPreview";
import DeckControls from "@/components/deck-builder/DeckControls";

export default function DeckBuilder() {
    const { collection, saveDeck, savedDecks, deleteDeck, bannedCardIds } = useProgression();
    // Cosmetic ban list (Phase 5): banned cards are greyed in the search panel and
    // blocked from being added. Saved decks are never stripped.
    const bannedIds = useMemo(() => new Set(bannedCardIds), [bannedCardIds]);
    const [allCards, setAllCards] = useState<Card[]>([]);
    const [hoveredCard, setHoveredCard] = useState<Card | null>(null);

    // Deck State
    const [mainDeck, setMainDeck] = useState<Card[]>([]);
    const [extraDeck, setExtraDeck] = useState<Card[]>([]);
    const [sideDeck, setSideDeck] = useState<Card[]>([]);

    const [deckName, setDeckName] = useState("New Deck");
    const [showLoadModal, setShowLoadModal] = useState(false);

    // Drag Preview State: the dragged card + where the drag started. Later
    // pointer moves go straight to the preview element via dragPreviewRef.
    const [drag, setDrag] = useState<{ card: Card; x: number; y: number } | null>(null);
    const dragPreviewRef = useRef<DragPreviewHandle>({ element: null, rafId: null });
    const emptyDragImageRef = useRef<HTMLImageElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragSourceRef = useRef<{ from: DragSource; index: number; cardId: number } | null>(null);
    const dropOccurredRef = useRef(false);

    const decks: Record<DeckZone, Card[]> = { main: mainDeck, extra: extraDeck, side: sideDeck };
    const setDeck = (zone: DeckZone, cards: Card[]) => {
        if (zone === 'main') setMainDeck(cards);
        else if (zone === 'extra') setExtraDeck(cards);
        else setSideDeck(cards);
    };

    const updateDragPreviewPosition = (x: number, y: number) => {
        const ref = dragPreviewRef.current;
        if (ref.rafId !== null) cancelAnimationFrame(ref.rafId);
        ref.rafId = requestAnimationFrame(() => {
            if (ref.element) ref.element.style.transform = dragPreviewTransform(x, y);
            ref.rafId = null;
        });
    };

    useEffect(() => {
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        emptyDragImageRef.current = img;
    }, []);

    // Fetch card data for everything owned (an empty collection clears the list).
    useEffect(() => {
        let cancelled = false;
        fetchCardsByIds(ownedCardIds(collection)).then(cards => {
            if (!cancelled) setAllCards(cards);
        });
        return () => {
            cancelled = true;
        };
    }, [collection]);

    // Firefox gives no coordinates on `drag`, so also track the pointer via dragover.
    const isDragging = drag !== null;
    useEffect(() => {
        if (!isDragging) return;
        const preview = dragPreviewRef.current;
        const handleDocumentDragOver = (e: DragEvent) => updateDragPreviewPosition(e.clientX, e.clientY);
        document.addEventListener('dragover', handleDocumentDragOver);
        return () => {
            document.removeEventListener('dragover', handleDocumentDragOver);
            if (preview.rafId !== null) cancelAnimationFrame(preview.rafId);
        };
    }, [isDragging]);

    const collectionCards = useMemo(() => {
        const counts = ownedCountsById(collection);
        [...mainDeck, ...extraDeck, ...sideDeck].forEach(card => {
            const current = counts.get(card.id) ?? 0;
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

        const getCards = (ids: number[]) => ids.map(id => cardsToUse.find(c => c.id === id)).filter(isDefined);
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
            ids.map(id => fetchedCards.find(c => c.id === id)).filter(isDefined);

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

    const handleDragStart = (e: React.DragEvent, card: Card, from: DragSource, index?: number) => {
        const payload: DragPayload = { cardId: card.id, from, index };
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "move";

        // Track drag source for drag-to-remove
        dragSourceRef.current = { from, index: index ?? -1, cardId: card.id };
        dropOccurredRef.current = false;

        // Use preloaded empty drag image
        if (emptyDragImageRef.current) {
            e.dataTransfer.setDragImage(emptyDragImageRef.current, 0, 0);
        }

        // Mount the custom preview at the pointer (start position as props, so no flicker)
        setDrag({ card, x: e.clientX, y: e.clientY });
    };

    const stopDragPreview = () => {
        setDrag(null);
        const preview = dragPreviewRef.current;
        if (preview.rafId !== null) {
            cancelAnimationFrame(preview.rafId);
            preview.rafId = null;
        }
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
                setDeck(from, removeCardFromDeck(decks[from], index));
            }
        }

        dragSourceRef.current = null;
        dropOccurredRef.current = false;
        stopDragPreview();
    };

    // Helper to find card by ID - searches allCards and current decks
    const findCardById = (cardId: number): Card | undefined => {
        return allCards.find(c => c.id === cardId)
            || mainDeck.find(c => c.id === cardId)
            || extraDeck.find(c => c.id === cardId)
            || sideDeck.find(c => c.id === cardId);
    };

    const insertAt = (deck: Card[], index: number, card: Card) => {
        const next = [...deck];
        next.splice(index, 0, card);
        return next;
    };

    const handleDrop = (e: React.DragEvent, to: DeckZone, index: number) => {
        e.preventDefault();
        dropOccurredRef.current = true;
        // Always clear the drag preview, whatever the drop's outcome.
        stopDragPreview();

        const payload = parseDragPayload(e.dataTransfer);
        if (!payload) return;
        const { from } = payload;
        const card = findCardById(payload.cardId);
        if (!card) return;

        const isExtra = isExtraDeckCard(card);
        if (to === 'extra' && !isExtra) return alert("Only Extra Deck monsters can go in Extra Deck");
        if (to === 'main' && isExtra && from !== 'main') return alert("Extra Deck monsters cannot go in Main Deck");

        const targetDeck = decks[to];
        if (to === 'main' && targetDeck.length >= 60 && from !== 'main') return alert("Main Deck Full (Max 60)");
        if ((to === 'extra' || to === 'side') && targetDeck.length >= 15 && from !== to) return alert("Extra/Side Deck Full (Max 15)");

        if (from === 'search') {
            if (bannedIds.has(card.id)) return alert("This card is banned and cannot be added.");
            if (getCopiesInAllDecks(card.id) >= 3) return alert("Max 3 copies allowed.");
            const available = collectionCards.find(entry => entry.card.id === card.id)?.count ?? 0;
            if (available <= 0) return;
            setDeck(to, insertAt(targetDeck, index, card));
            return;
        }

        // Moving between (or within) deck sections.
        if (payload.index === undefined) return;
        const sourceWithout = removeCardFromDeck(decks[from], payload.index);
        if (from === to) {
            setDeck(to, insertAt(sourceWithout, index, card));
        } else {
            setDeck(from, sourceWithout);
            setDeck(to, insertAt(targetDeck, index, card));
        }
    };

    const handleRightClick = (e: React.MouseEvent, _card: Card, from: DeckZone, index: number) => {
        e.preventDefault();
        setDeck(from, removeCardFromDeck(decks[from], index));
    };

    const handleSearchDragStart = (e: React.DragEvent, card: Card) => handleDragStart(e, card, 'search');

    const handleDoubleClick = (card: Card) => {
        const isExtra = isExtraDeckCard(card);
        const deck = isExtra ? extraDeck : mainDeck;

        if (bannedIds.has(card.id)) return alert("This card is banned and cannot be added.");
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
                        bannedIds={bannedIds}
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

        {drag && <DragPreview card={drag.card} x={drag.x} y={drag.y} previewRef={dragPreviewRef} />}
        </>
    );
}
