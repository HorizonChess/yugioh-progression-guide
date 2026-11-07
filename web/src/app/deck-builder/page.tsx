"use client";

import { useWelcome } from "@/lib/guide/welcome";
import { alertRepoError, useProgression, SavedDeck } from "@/context/ProgressionContext";
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
import DeckPhone from "@/components/deck-builder/DeckPhone";
import { ownedPrintings } from "@/components/deck-builder/stage";
import { useIsPhone } from "@/lib/useIsPhone";
import { gameAlert, gameConfirm } from "@/components/ui/GameDialog";
import "@/components/deck-builder/deck-builder.css";

/** Says why the deck rules refuse a move, in the game's own dialog. */
const ruleAlert = (message: string, title = "Not allowed") => void gameAlert(message, { title });

export default function DeckBuilder() {
    const { collection, saveDeck, savedDecks, deleteDeck, bannedCardIds } = useProgression();
    const isPhone = useIsPhone();
    useWelcome("deck-builder", true);
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
    const handleSaveDeck = async () => {
        if (!deckName.trim()) return void gameAlert("Give your deck a name first.", { title: "Name your deck" });
        if (mainDeck.length < 40) {
            if (!(await gameConfirm(`The Main Deck has ${mainDeck.length} cards; a legal deck needs at least 40.`, { title: "Save anyway?", confirmLabel: "Save" }))) return;
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
            if (!(await gameConfirm(`A deck named "${deckName}" already exists.`, { title: "Overwrite it?", confirmLabel: "Overwrite", danger: true }))) return;
            deckData.id = existing.id;
        }

        try {
            await saveDeck(deckData);
            void gameAlert(`"${deckName}" is saved.`, { title: "Deck saved" });
        } catch (error) {
            alertRepoError(error);
        }
    };

    const handleLoadDeck = async (deck: SavedDeck, announce = true) => {
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
        if (announce) void gameAlert(`"${deck.name}" is loaded.`, { title: "Deck loaded" });
    };

    // Open on the deck you last saved (saving stamps it, so the newest stamp is the last one),
    // unless you've already started building. Once per visit.
    const autoLoaded = useRef(false);
    useEffect(() => {
        if (autoLoaded.current || savedDecks.length === 0) return;
        autoLoaded.current = true;
        if (mainDeck.length + extraDeck.length + sideDeck.length > 0) return;
        const last = savedDecks.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
        void handleLoadDeck(last, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the saved decks first arrive
    }, [savedDecks]);

    const handleDeleteDeck = async (id: string) => {
        const name = savedDecks.find(d => d.id === id)?.name;
        if (await gameConfirm(name ? `"${name}" will be deleted.` : "This deck will be deleted.", { title: "Delete this deck?", confirmLabel: "Delete", danger: true })) {
            deleteDeck(id).catch(alertRepoError);
        }
    };

    const handleClearDeck = async () => {
        if (await gameConfirm("Every card will be taken out of the Main, Extra and Side Decks.", { title: "Clear this deck?", confirmLabel: "Clear", danger: true })) {
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
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (main.length === 0 && extra.length === 0 && side.length === 0) return void gameAlert("No valid card IDs were found in that YDK file.", { title: "Nothing to import" });
        if ((mainDeck.length > 0 || extraDeck.length > 0 || sideDeck.length > 0) && !(await gameConfirm("The deck you're building will be replaced.", { title: "Import this deck?", confirmLabel: "Import" }))) return;

        const fetchedCards = await fetchCardsByIds([...new Set([...main, ...extra, ...side])]);
        const newAllCards = [...allCards];
        fetchedCards.forEach(card => { if (!newAllCards.find(c => c.id === card.id)) newAllCards.push(card); });
        setAllCards(newAllCards);

        const getCards = (ids: number[]) =>
            ids.map(id => fetchedCards.find(c => c.id === id)).filter(isDefined);

        setMainDeck(getCards(main));
        setExtraDeck(getCards(extra));
        setSideDeck(getCards(side));

        void gameAlert(`${main.length} Main, ${extra.length} Extra and ${side.length} Side Deck cards.`, { title: "Deck imported" });
    };

    const handleExportClick = async () => {
        if (mainDeck.length === 0 && extraDeck.length === 0 && sideDeck.length === 0) {
            void gameAlert("Add some cards before exporting.", { title: "The deck is empty" });
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

    /** Why `card` can't go into `zone` right now, or null if it can. */
    const refuse = (card: Card, zone: DeckZone): string | null => {
        if (bannedIds.has(card.id)) return "This card is banned and cannot be added.";
        const isExtra = isExtraDeckCard(card);
        if (zone === 'extra' && !isExtra) return "Only Extra Deck monsters can go in Extra Deck";
        if (zone === 'main' && isExtra) return "Extra Deck monsters cannot go in Main Deck";
        if (zone === 'main' && mainDeck.length >= 60) return "Main Deck Full (Max 60)";
        if (zone !== 'main' && decks[zone].length >= 15) return "Extra/Side Deck Full (Max 15)";
        if (getCopiesInAllDecks(card.id) >= 3) return "Max 3 copies allowed.";
        if ((collectionCards.find(entry => entry.card.id === card.id)?.count ?? 0) <= 0) return "Every copy you own is already in.";
        return null;
    };
    /** Adds one copy to `zone` (its home deck by default); returns why not, or null. */
    const addCard = (card: Card, zone: DeckZone = isExtraDeckCard(card) ? 'extra' : 'main') => {
        const why = refuse(card, zone);
        if (!why) setDeck(zone, [...decks[zone], card]);
        return why;
    };
    /** Takes the last copy of `card` out of `zone`. */
    const removeCard = (card: Card, zone: DeckZone) => {
        const i = decks[zone].map(c => c.id).lastIndexOf(card.id);
        if (i >= 0) setDeck(zone, removeCardFromDeck(decks[zone], i));
    };
    const ownedCounts = useMemo(() => ownedCountsById(collection), [collection]);
    const printings = useMemo(() => ownedPrintings(collection), [collection]);

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
        if (to === 'extra' && !isExtra) return ruleAlert("Only Extra Deck monsters go in the Extra Deck.");
        if (to === 'main' && isExtra && from !== 'main') return ruleAlert("Extra Deck monsters can't go in the Main Deck.");

        const targetDeck = decks[to];
        if (to === 'main' && targetDeck.length >= 60 && from !== 'main') return ruleAlert("The Main Deck is full (60 cards max).", "Deck full");
        if ((to === 'extra' || to === 'side') && targetDeck.length >= 15 && from !== to) return ruleAlert(`The ${to === "extra" ? "Extra" : "Side"} Deck is full (15 cards max).`, "Deck full");

        if (from === 'search') {
            if (bannedIds.has(card.id)) return ruleAlert("This card is banned and can't be added.", "Forbidden card");
            if (getCopiesInAllDecks(card.id) >= 3) return ruleAlert("A deck can hold at most 3 copies of a card.", "Three copies max");
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

        if (bannedIds.has(card.id)) return ruleAlert("This card is banned and can't be added.", "Forbidden card");
        if (!isExtra && deck.length >= 60) return ruleAlert("The Main Deck is full (60 cards max).", "Deck full");
        if (isExtra && deck.length >= 15) return ruleAlert("The Extra Deck is full (15 cards max).", "Deck full");
        if (getCopiesInAllDecks(card.id) >= 3) return ruleAlert("A deck can hold at most 3 copies of a card.", "Three copies max");
        if ((collectionCards.find(entry => entry.card.id === card.id)?.count || 0) <= 0) return;

        if (isExtra) setExtraDeck([...extraDeck, card]);
        else setMainDeck([...mainDeck, card]);
    };

    const shared = (
        <>
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
                    onLoad={(deck) => void handleLoadDeck(deck)}
                    onDelete={handleDeleteDeck}
                    onClose={() => setShowLoadModal(false)}
                />
            )}
        </>
    );

    // Phones: the deck above as cards, your cards in a drawer below; taps, no dragging.
    if (isPhone) {
        return (
            <>
                <DeckPhone
                    deckName={deckName}
                    onDeckNameChange={setDeckName}
                    decks={decks}
                    stats={stats}
                    collectionCards={collectionCards}
                    ownedCounts={ownedCounts}
                    printings={printings}
                    bannedIds={bannedIds}
                    copies={getCopiesInAllDecks}
                    refuse={refuse}
                    onAdd={addCard}
                    onRemove={removeCard}
                    onSave={handleSaveDeck}
                    onLoad={() => setShowLoadModal(true)}
                    onClear={handleClearDeck}
                    onSort={handleSortDeck}
                    onImport={handleImportClick}
                    onExport={handleExportClick}
                />
                {shared}
                <GuideSprite />
            </>
        );
    }

    return (
        <>
        <ScaleWrapper backgroundColor="transparent">
            <div className="flex flex-col h-full w-full text-slate-100 overflow-hidden">
            {/* The nav is hoisted to the root layout above ScaleWrapper, so it's
                no longer scaled with the board. */}
            <div className="flex flex-1 p-2 gap-2 overflow-hidden relative min-h-0">

                {/* Left Column: Info + Controls */}
                <div className="w-[300px] shrink-0 db-panel">
                    <div className="db-band">Card <small>{hoveredCard ? printings.get(hoveredCard.id)?.setCode ?? hoveredCard.card_sets?.[0]?.set_code ?? "" : ""}</small></div>
                    {/* Card Info: its text box scrolls inside the card */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <CardInfoPanel card={hoveredCard} owned={hoveredCard ? ownedCounts.get(hoveredCard.id) ?? 0 : 0} printing={hoveredCard ? printings.get(hoveredCard.id) : undefined} />
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
                <div className="flex-[3] min-w-0 min-h-0">
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
                <div className="w-[240px] shrink-0 min-h-0">
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
                <div className="w-[290px] shrink-0 flex flex-col min-h-0">
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

            {/* He stands on the Main Deck's mat, clear of the card panel and its buttons. */}
            <GuideSprite at="19vw" />
            {shared}

            </div>
        </ScaleWrapper>

        {drag && <DragPreview card={drag.card} x={drag.x} y={drag.y} previewRef={dragPreviewRef} />}
        </>
    );
}
