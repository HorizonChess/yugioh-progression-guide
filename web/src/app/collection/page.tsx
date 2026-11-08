"use client";

import { useWelcome } from "@/lib/guide/welcome";
import { alertRepoError, useProgression } from "@/context/ProgressionContext";
import { gameAlert, gameAsk, gameConfirm } from "@/components/ui/GameDialog";
import { useAuth } from "@/context/AuthContext";
import { fetchAllSets, fetchCardsByIds, fetchCardsInSet, Card, CardSet } from "@/lib/api";
import { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } from "react";
import CollectionFilters, { DEFAULT_FILTERS, FilterState } from "@/components/collection/CollectionFilters";
import Binder, { type BinderChapter, type BinderSlot } from "@/components/collection/Binder";
import CardScroll from "@/components/collection/CardScroll";
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

/** How the collection is shown: one scrolling grid (the default), or the ring binder. Remembered on this device. */
type View = "scroll" | "binder";
const VIEW_KEY = "ygo-collection-view";
const viewListeners = new Set<() => void>();
const readView = (): View => {
    try {
        return localStorage.getItem(VIEW_KEY) === "binder" ? "binder" : "scroll";
    } catch {
        return "scroll";
    }
};
const setView = (v: View) => {
    try {
        localStorage.setItem(VIEW_KEY, v);
    } catch { /* private mode: this visit only */ }
    viewListeners.forEach((f) => f());
};
const subscribeView = (f: () => void) => {
    viewListeners.add(f);
    return () => viewListeners.delete(f);
};

const GRID_ICON = <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="5" height="7" rx="1" /><rect x="9.5" y="3" width="5" height="7" rx="1" /><rect x="16" y="3" width="5" height="7" rx="1" /><rect x="3" y="13" width="5" height="7" rx="1" /><rect x="9.5" y="13" width="5" height="7" rx="1" /><rect x="16" y="13" width="5" height="7" rx="1" /></svg>;
const BOOK_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 6c-2-1.6-5-2-8-1.6v14c3-.4 6 0 8 1.6 2-1.6 5-2 8-1.6v-14c-3-.4-6 0-8 1.6z" /><path d="M12 6v14" /></svg>;

const toStage = (s: BinderSlot): StageCard => ({
    card: s.card, image: s.card.card_images[0]?.image_url ?? "", tier: s.tier, rarity: s.rarity, code: s.code,
    owned: s.count, ownedNote: s.count ? `Owned ×${s.count}` : "Not owned yet",
});

/**
 * The card COLLECTION (route: /collection), as one scrolling grid (the default)
 * or a ring binder, toggled from the heading: a chapter per set
 * reached (or that you own cards from), each the whole set in number order with
 * an empty pocket for every card still missing. Searching or any filter turns
 * the binder to just your matching cards, in the chosen sort. Today's filter
 * panel sits in a drawer; YDK import/export and delete are under the ⋯ menu.
 */
export default function Collection() {
    const { collection, importCollection, currentSetIndex } = useProgression();
    const owner = useAuth().user?.duelistName ?? "Guest";
    const isPhone = useIsPhone();
    const view = useSyncExternalStore(subscribeView, readView, () => "scroll" as View);
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

        // Free the picker now, so the same file can be picked again after a Cancel.
        if (fileInputRef.current) fileInputRef.current.value = "";

        if (ids.length === 0) {
            void gameAlert("No valid card IDs were found in that YDK file.", { title: "Nothing to import" });
            return;
        }

        const mode = await gameAsk<"add" | "replace" | null>({
            title: `Import ${ids.length} cards`,
            message: "Add them to your collection, or replace your collection with them?",
            buttons: [
                { label: "Cancel", value: null, kind: "quiet" },
                { label: "Replace", value: "replace", kind: "quiet" },
                { label: "Add", value: "add" },
            ],
            dismissValue: null,
        });
        if (!mode) return;

        if (mode === "replace" && !(await gameConfirm("Your current collection will be deleted and replaced with the YDK contents.", { title: "Replace your collection?", confirmLabel: "Replace", danger: true }))) {
            return;
        }

        try {
            await importCollection(ids, mode);
            void gameAlert(`${ids.length} cards were imported.`, { title: "Import complete" });
        } catch (error) {
            alertRepoError(error);
        }
    };

    const handleExportClick = async () => {
        const content = generateYDKFromCollection(collection);
        await downloadYDK("collection.ydk", content);
    };

    const handleDelete = async () => {
        if (await gameConfirm("Your entire collection will be deleted for good. This can't be undone.", { title: "Delete your collection?", confirmLabel: "Delete", danger: true })) {
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

    const ownedSlot = useCallback((e: OwnedEntry): BinderSlot => {
        const rarity = resolveRarity(e);
        return { key: e.key, card: e.card, count: e.count, rarity, code: e.setCode === UNKNOWN_SET ? "" : e.setCode, tier: tierOf(rarity) };
    }, [resolveRarity]);
    const slots = useMemo<BinderSlot[]>(() => {
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
    }, [searching, filteredCards, chapter, strays, chapterCards, owned, ownedSlot]);

    // The scroll view: every card you own, one endless wall in the order of the chapters (each
    // printing under its own set), with no break between sets. The chips only say where you are.
    // Keyed on the chapters' order alone: their counts filling in mustn't rebuild the wall (and send you to the top).
    const chapterOrder = chapters.map((c) => c.key).join("|");
    const wall = useMemo<BinderSlot[]>(() => {
        const order = new Map(chapterOrder.split("|").map((k, i) => [k, i]));
        const chapterOf = (e: OwnedEntry) => (e.setCode !== UNKNOWN_SET && order.has(prefixOf(e.setCode)) ? prefixOf(e.setCode) : OTHER);
        return filterCollection(collection, cards, DEFAULT_FILTERS)
            .map((e) => ({ ...ownedSlot(e), chapter: chapterOf(e) }))
            .sort((a, b) => (order.get(a.chapter) ?? 1e9) - (order.get(b.chapter) ?? 1e9) || a.code.localeCompare(b.code, undefined, { numeric: true }));
    }, [chapterOrder, collection, cards, ownedSlot]);

    // The binder keeps a pocket for every card of the set; the scroll view shows only what you own.
    const shown = useMemo(() => (view === "binder" || searching ? slots : wall), [view, searching, slots, wall]);

    useWelcome("collection", !loading);

    if (loading && Object.keys(collection).length > 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-xl animate-pulse text-primary">Loading Collection...</div>
            </div>
        );
    }

    const isEmpty = Object.keys(collection).length === 0;
    const selectedIndex = selectedKey ? shown.findIndex((s) => s.key === selectedKey) : -1;
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

    // What either view shows: the cards, the chapters, and what a tap does.
    const shelf = {
        slots: shown,
        chapters,
        activeChapter: searching ? null : chapter,
        onChapter: (k: string) => {
            setChapterPick(k);
            setSearch("");
        },
        onOpen: (s: BinderSlot) => {
            hide();
            setSelectedKey(s.key);
            // Yugi's word on the card, if he has one, over the close-up.
            guide.say(cardTip(s.card, currentSetIndex, seed()));
        },
        // The scroll view's wall moving on to another set's cards: its chip lights up.
        onSpot: (k: string) => setChapterPick(k),
        showKey: selectedKey,
        bind: (s: BinderSlot) => bind(toStage(s)),
        empty: searching
            ? "No cards match. Try fewer filters."
            : chapter && chapter !== OTHER && !chapterCards[chapter]
                ? "Opening the chapter…"
                : undefined,
    };

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
                {isPhone ? (
                    // Phones: one button, showing the view it switches to.
                    <button className="ps-btn coll__icon" aria-label={view === "scroll" ? "Switch to binder view" : "Switch to scroll view"} title={view === "scroll" ? "Binder view" : "Scroll view"} onClick={() => setView(view === "scroll" ? "binder" : "scroll")}>
                        {view === "scroll" ? BOOK_ICON : GRID_ICON}
                    </button>
                ) : (
                    <div className="coll__view" role="group" aria-label="View">
                        <button className={`coll__view-btn ${view === "scroll" ? "coll__view-btn--on" : ""}`} aria-pressed={view === "scroll"} onClick={() => setView("scroll")}>
                            {GRID_ICON}<span>Scroll</span>
                        </button>
                        <button className={`coll__view-btn ${view === "binder" ? "coll__view-btn--on" : ""}`} aria-pressed={view === "binder"} onClick={() => setView("binder")}>
                            {BOOK_ICON}<span>Binder</span>
                        </button>
                    </div>
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

            {view === "binder" ? (
                <Binder
                    owner={owner}
                    title={searching ? "Search results" : info?.label ?? ""}
                    chapterCode={searching ? "" : chapter ?? ""}
                    {...shelf}
                    isPhone={isPhone}
                />
            ) : (
                <CardScroll {...shelf} />
            )}

            {/* Today's filter panel, unchanged, in a drawer. It stays mounted so it keeps its choices. */}
            <div className="coll__drawer-bg" onClick={() => setFiltersOpen(false)} />
            <aside className="coll__drawer" ref={drawerEl} aria-label="Filters" aria-hidden={!filtersOpen}>
                <CollectionFilters onFilterChange={handleFilterChange} hideSearch />
                <button className="ps-btn coll__drawer-done" onClick={() => setFiltersOpen(false)}>Show {filteredCards.length} cards</button>
            </aside>

            {peek}
            {selectedIndex >= 0 && (
                <LookedAt key={shown[selectedIndex]!.card.id} cardId={shown[selectedIndex]!.card.id} />
            )}
            {selectedIndex >= 0 && (
                <CardCloseUp
                    card={toStage(shown[selectedIndex]!)}
                    mark
                    // Flies back to the card it's showing now, wherever the list has it.
                    from={() => document.querySelector(`.coll [data-key="${CSS.escape(shown[selectedIndex]!.key)}"] img`)}
                    onClose={() => setSelectedKey(null)}
                    onPrev={selectedIndex > 0 ? () => setSelectedKey(shown[selectedIndex - 1]!.key) : undefined}
                    onNext={selectedIndex < shown.length - 1 ? () => setSelectedKey(shown[selectedIndex + 1]!.key) : undefined}
                    position={`${selectedIndex + 1} / ${shown.length}`}
                />
            )}
        </div>
    );
}
