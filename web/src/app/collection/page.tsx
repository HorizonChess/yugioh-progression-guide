"use client";

import { alertRepoError, useProgression } from "@/context/ProgressionContext";
import { useAuth } from "@/context/AuthContext";
import { fetchAllSets, fetchCardsByIds, fetchCardsInSet, Card, CardSet } from "@/lib/api";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import CollectionFilters, { DEFAULT_FILTERS, FilterState } from "@/components/collection/CollectionFilters";
import Binder, { type BinderChapter, type BinderSlot } from "@/components/collection/Binder";
import { CardCloseUp, useCardPeek } from "@/components/card/CardPlate";
import { LookedAt } from "@/components/card/LookLater";
import { tierOf, type StageCard } from "@/components/packs/stage/plate";
import { parseYDK, generateYDKFromCollection, downloadYDK } from "@/lib/ydk-parser";
import { filterCollection, type OwnedEntry } from "@/lib/collection-filter";
import GuideSprite from "@/components/layout/GuideSprite";
import { cardTip } from "@/lib/guide/lines";
import { guide, seed } from "@/lib/guide/store";
import { useIsPhone } from "@/lib/useIsPhone";
import { useDismiss, useSwipeClose } from "@/lib/dismiss";
import { ownedCardIds, ownedCountsById, parseCollectionKey, UNKNOWN_SET } from "@/lib/collection";

/** The chapter for owned cards from sets outside the binder's chapters (e.g. YDK imports). */
const OTHER = "MORE";
const prefixOf = (code: string) => code.split("-")[0] ?? code;
const KEYS = Object.keys(DEFAULT_FILTERS) as (keyof FilterState)[];

const toStage = (s: BinderSlot): StageCard => ({
    card: s.card, image: s.card.card_images[0]?.image_url ?? "", tier: s.tier, rarity: s.rarity, code: s.code,
    owned: s.count, ownedNote: s.count ? `Owned ×${s.count}` : "Not owned yet",
});

/**
 * The card COLLECTION (route: /collection), as a ring binder: a chapter per set
 * reached (or that you own cards from), each the whole set in number order with
 * an empty pocket for every card still missing. Searching or any filter turns
 * the binder to just your matching cards, in the chosen sort. Today's filter
 * panel sits in a drawer; YDK import/export and delete are under the ⋯ menu.
 */
export default function Collection() {
    const { collection, importCollection, currentSetIndex } = useProgression();
    const owner = useAuth().user?.duelistName ?? "Guest";
    const isPhone = useIsPhone();
    const [cards, setCards] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);
    /** The card open in the close-up, by its pocket. */
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const { bind, peek, hide } = useCardPeek();

    // The drawer's panel holds every filter but the search, which sits on the page.
    const [panel, setPanel] = useState<FilterState>(DEFAULT_FILTERS);
    const [search, setSearch] = useState("");
    // Phones fold the search behind a button on the title row; it stays open while it holds a query.
    const [searchOpen, setSearchOpen] = useState(false);
    const showBar = !isPhone || searchOpen || search !== "";
    const filters = useMemo(() => ({ ...panel, search }), [panel, search]);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuEl = useRef<HTMLDivElement>(null);
    useDismiss(menuEl, menuOpen, () => setMenuOpen(false));
    const drawerEl = useRef<HTMLElement>(null);
    // the filters are a bottom sheet on phones: swipe it down to close
    useSwipeClose(drawerEl, () => setFiltersOpen(false), { enabled: isPhone && filtersOpen });

    // Stable, because CollectionFilters re-sends filters whenever this handler changes.
    const handleFilterChange = useCallback((next: FilterState) => setPanel(next), []);

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

        if (fileInputRef.current) fileInputRef.current.value = "";
        try {
            await importCollection(ids, mode);
            alert(`Successfully imported ${ids.length} cards!`);
        } catch (error) {
            alertRepoError(error);
        }
    };

    const handleExportClick = async () => {
        const content = generateYDKFromCollection(collection);
        await downloadYDK("collection.ydk", content);
    };

    const handleDelete = () => {
        if (confirm("WARNING: This will PERMANENTLY DELETE your entire collection. This action cannot be undone. Are you sure?")) {
            importCollection([], "replace").catch(alertRepoError);
        }
    };

    // Fetch card data for every owned card id.
    useEffect(() => {
        let cancelled = false;
        fetchCardsByIds(ownedCardIds(collection)).then((fetched) => {
            if (cancelled) return;
            setCards(fetched);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [collection]);

    const filteredCards = useMemo(() => filterCollection(collection, cards, filters), [cards, collection, filters]);

    // The rarity label shown on a card: the pulled rarity, else the active
    // rarity filter if this card has it, else the card's first printed rarity.
    const resolveRarity = useCallback((entry: OwnedEntry) => {
        const { card, rarity } = entry;
        if (rarity !== "Unknown") return rarity;
        if (filters.rarity !== "All" && card.card_sets?.some((s) => s.set_rarity === filters.rarity)) {
            return filters.rarity;
        }
        return card.card_sets?.[0]?.set_rarity || "Common";
    }, [filters.rarity]);

    // ---- the chapters: the sets reached, and any others you own cards from ----
    const [sets, setSets] = useState<CardSet[]>([]);
    useEffect(() => {
        fetchAllSets().then(setSets);
    }, []);
    const owned = useMemo(() => ownedCountsById(collection), [collection]);
    const [chapterCards, setChapterCards] = useState<Record<string, Card[]>>({});
    const ownedBySet = useMemo(() => {
        const m = new Map<string, Set<number>>();
        for (const key of Object.keys(collection)) {
            const p = parseCollectionKey(key);
            if (!p) continue;
            const k = p.setCode === UNKNOWN_SET ? OTHER : prefixOf(p.setCode);
            m.set(k, (m.get(k) ?? new Set()).add(p.id));
        }
        return m;
    }, [collection]);
    const chapterSets = useMemo(
        () => sets.filter((s, i) => i <= currentSetIndex || ownedBySet.has(prefixOf(s.set_code))),
        [sets, currentSetIndex, ownedBySet],
    );
    const strays = useMemo(() => {
        const known = new Set(chapterSets.map((s) => prefixOf(s.set_code)));
        return filterCollection(collection, cards, DEFAULT_FILTERS).filter((e) => e.setCode === UNKNOWN_SET || !known.has(prefixOf(e.setCode)));
    }, [chapterSets, collection, cards]);
    const chapters: BinderChapter[] = useMemo(() => [
        // The set list's count includes every printing, so a chapter's total waits for its own card list.
        ...chapterSets.map((s) => ({ key: prefixOf(s.set_code), label: s.set_name, owned: ownedBySet.get(prefixOf(s.set_code))?.size ?? 0, total: chapterCards[prefixOf(s.set_code)]?.length ?? null })),
        ...(strays.length ? [{ key: OTHER, label: "More cards", owned: strays.length, total: strays.length }] : []),
    ], [chapterSets, ownedBySet, strays, chapterCards]);

    // Open on the current set's chapter until the player picks another.
    const [chapterPick, setChapterPick] = useState<string | null>(null);
    const currentKey = sets[currentSetIndex] ? prefixOf(sets[currentSetIndex]!.set_code) : null;
    const chapter = chapterPick ?? (chapters.some((c) => c.key === currentKey) ? currentKey : chapters[0]?.key ?? null);
    const chapterSet = chapterSets.find((s) => prefixOf(s.set_code) === chapter);

    // A chapter's whole card list, fetched the first time it's opened.
    useEffect(() => {
        if (!chapter || !chapterSet || chapterCards[chapter]) return;
        let gone = false;
        fetchCardsInSet(chapterSet.set_name).then((list) => {
            if (!gone) setChapterCards((m) => ({ ...m, [chapter]: list }));
        });
        return () => {
            gone = true;
        };
    }, [chapter, chapterSet, chapterCards]);

    const searching = KEYS.some((k) => filters[k] !== DEFAULT_FILTERS[k]);
    const activeCount = KEYS.filter((k) => k !== "search" && panel[k] !== DEFAULT_FILTERS[k]).length;

    const slots = useMemo<BinderSlot[]>(() => {
        const ownedSlot = (e: OwnedEntry): BinderSlot => {
            const rarity = resolveRarity(e);
            return { key: e.key, card: e.card, count: e.count, rarity, code: e.setCode === UNKNOWN_SET ? "" : e.setCode, tier: tierOf(rarity) };
        };
        if (searching) return filteredCards.map(ownedSlot);
        if (chapter === OTHER) return strays.map(ownedSlot);
        const list = chapter ? chapterCards[chapter] : undefined;
        if (!list) return [];
        return list
            .map((card) => {
                const print = card.card_sets?.find((p) => prefixOf(p.set_code) === chapter);
                const rarity = print?.set_rarity ?? "Common";
                return { key: `${card.id}-${print?.set_code ?? ""}`, card, count: owned.get(card.id) ?? 0, rarity, code: print?.set_code ?? "", tier: tierOf(rarity) };
            })
            .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    }, [searching, filteredCards, chapter, strays, chapterCards, owned, resolveRarity]);

    if (loading && Object.keys(collection).length > 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-xl animate-pulse text-primary">Loading Collection...</div>
            </div>
        );
    }

    const isEmpty = Object.keys(collection).length === 0;
    const selectedIndex = selectedKey ? slots.findIndex((s) => s.key === selectedKey) : -1;
    const info = chapters.find((c) => c.key === chapter);
    const meta = searching
        ? `of ${filterCollection(collection, cards, DEFAULT_FILTERS).length} you own`
        : isEmpty
            ? "Empty for now: open some packs to fill it."
            : info && chapter !== OTHER
                ? info.total === null
                    ? `${chapterSet?.tcg_date ?? ""} · ${info.owned} collected`
                    : `${chapterSet?.tcg_date ?? ""} · ${info.owned} of ${info.total} collected · ${Math.round((info.owned / Math.max(1, info.total)) * 100)}%`
                : "Cards from sets outside your binder's chapters";

    return (
        <div className={`coll ${filtersOpen ? "coll--filters" : ""}`} onClick={() => setMenuOpen(false)}>
            <GuideSprite />
            <div className="coll__head">
                <div className="coll__title">
                    <p className="store__stage">{searching ? "Searching your binder" : chapter ? `Chapter · ${chapter}` : "Your binder"}</p>
                    <h1>{searching ? `${filteredCards.length} cards found` : info?.label ?? "Collection"}</h1>
                    <p className="store__meta">{meta}</p>
                </div>
                {isPhone && (
                    <>
                        <button className="ps-btn coll__icon" aria-label="Search your cards" aria-expanded={showBar} onClick={() => { if (showBar) { setSearch(""); setSearchOpen(false); } else setSearchOpen(true); }}>
                            {showBar ? "✕" : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>}
                        </button>
                        <button className="ps-btn" onClick={() => setFiltersOpen(true)}>
                            Filters{activeCount > 0 && <span className="coll__n">{activeCount}</span>}
                        </button>
                    </>
                )}
                <div className="coll__menu" ref={menuEl} onClick={(e) => e.stopPropagation()}>
                    <button className="ps-btn" aria-haspopup="true" aria-expanded={menuOpen} aria-label="More" onClick={() => setMenuOpen((v) => !v)}>⋯</button>
                    {menuOpen && (
                        <div className="coll__menu-list" role="menu">
                            <button role="menuitem" onClick={() => { setMenuOpen(false); handleImportClick(); }}>Import YDK</button>
                            <button role="menuitem" onClick={() => { setMenuOpen(false); void handleExportClick(); }}>Export YDK</button>
                            <button role="menuitem" className="coll__danger" onClick={() => { setMenuOpen(false); handleDelete(); }}>Delete collection</button>
                        </div>
                    )}
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".ydk" className="hidden" />
            </div>

            {showBar && (
                <div className="coll__bar">
                    <label className="coll__search">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your cards by name or text" aria-label="Search your cards" autoFocus={isPhone} />
                    </label>
                    {!isPhone && (
                        <button className="ps-btn" onClick={() => setFiltersOpen(true)}>
                            Filters{activeCount > 0 && <span className="coll__n">{activeCount}</span>}
                        </button>
                    )}
                </div>
            )}

            <Binder
                owner={owner}
                title={searching ? "Search results" : info?.label ?? ""}
                chapterCode={searching ? "" : chapter ?? ""}
                slots={slots}
                chapters={chapters}
                activeChapter={searching ? null : chapter}
                onChapter={(k) => {
                    setChapterPick(k);
                    setSearch("");
                }}
                onOpen={(s) => {
                    hide();
                    setSelectedKey(s.key);
                    // Yugi's word on the card, if he has one, over the close-up.
                    guide.say(cardTip(s.card, currentSetIndex, seed()));
                }}
                showKey={selectedKey}
                bind={(s) => bind(toStage(s))}
                empty={searching ? "No cards match. Try fewer filters." : chapter && chapter !== OTHER && !chapterCards[chapter] ? "Opening the chapter…" : undefined}
                isPhone={isPhone}
            />

            {/* Today's filter panel, unchanged, in a drawer. It stays mounted so it keeps its choices. */}
            <div className="coll__drawer-bg" onClick={() => setFiltersOpen(false)} />
            <aside className="coll__drawer" ref={drawerEl} aria-label="Filters" aria-hidden={!filtersOpen}>
                <CollectionFilters onFilterChange={handleFilterChange} hideSearch />
                <button className="ps-btn coll__drawer-done" onClick={() => setFiltersOpen(false)}>Show {filteredCards.length} cards</button>
            </aside>

            {peek}
            {selectedIndex >= 0 && (
                <LookedAt key={slots[selectedIndex]!.card.id} cardId={slots[selectedIndex]!.card.id} />
            )}
            {selectedIndex >= 0 && (
                <CardCloseUp
                    card={toStage(slots[selectedIndex]!)}
                    mark
                    onClose={() => setSelectedKey(null)}
                    onPrev={selectedIndex > 0 ? () => setSelectedKey(slots[selectedIndex - 1]!.key) : undefined}
                    onNext={selectedIndex < slots.length - 1 ? () => setSelectedKey(slots[selectedIndex + 1]!.key) : undefined}
                    position={`${selectedIndex + 1} / ${slots.length}`}
                />
            )}
        </div>
    );
}
