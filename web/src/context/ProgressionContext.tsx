"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { guide } from '@/lib/guide/store';
import { gameAlert } from '@/components/ui/GameDialog';
import { Collection } from '@/lib/collection';
import { LocalRepo } from '@/lib/repo/local';
import { RemoteRepo } from '@/lib/repo/remote';
import {
    RepoError,
    type CreateSeriesInput,
    type GameRepository,
    type Opening,
    type OpenOptions,
    type PlayerView,
    type ReportOutcome,
    type SeriesSummary,
    type SeriesView,
} from '@/lib/repo/types';
import { RewardEntry, RivalReward, WheelPrize } from '@/lib/rewards';
import { MatchResult, SavedDeck } from '@/lib/storage';

export type { MatchResult, SavedDeck } from '@/lib/storage';

interface ProgressionContextType {
    repo: GameRepository;
    hasLoaded: boolean;

    seriesList: SeriesSummary[];
    activeSeriesId: string | null;
    series: SeriesView | null;
    me: PlayerView | null;

    // Shortcuts into the active series
    currentSetIndex: number;
    collection: Collection;
    matchHistory: MatchResult[];
    rewards: RewardEntry[];
    bannedCardIds: number[];
    savedDecks: SavedDeck[];

    /** Creates a series, makes it the active one and returns its id. */
    createSeries: (input: CreateSeriesInput) => Promise<string>;
    loadSeries: (id: string) => Promise<void>;
    deleteSeries: (id: string) => Promise<void>;
    /** Re-reads the list, and the active series if it's `seriesId` (or none is named): a rival moved. */
    refresh: (seriesId?: string) => Promise<void>;

    // Commands on the active series; refusals throw RepoError with a message to show.
    openPacks: (options?: OpenOptions) => Promise<Opening>;
    activeOpening: (kind: 'set' | 'reward') => Promise<Opening | null>;
    flip: (openingId: string, flipped: number[]) => Promise<void>;
    saveOpening: (openingId: string) => Promise<void>;
    reroll: (openingId: string) => Promise<Opening>;
    reportMatch: (won: boolean) => Promise<ReportOutcome>;
    confirmReport: (reportId: string) => Promise<RewardEntry>;
    rejectReport: (reportId: string) => Promise<void>;
    spin: (rewardId: string) => Promise<WheelPrize>;
    claimReward: (rewardId: string, cardId?: number, printing?: string) => Promise<Opening | null>;
    rivalBinder: () => Promise<Collection>;
    rivalRewards: () => Promise<RivalReward[]>;
    /** Cards marked to look at later: shown in the binder and deck builder, cleared once looked at there. */
    marks: ReadonlySet<number>;
    /** Marks or unmarks a card; the change shows at once, and is undone if it can't be saved. */
    setMark: (cardId: number, on: boolean) => void;
    saveDeck: (deck: SavedDeck) => Promise<void>;
    deleteDeck: (deckId: string) => Promise<void>;
    importCollection: (cardIds: number[], mode: 'add' | 'replace') => Promise<void>;

    isGuideVisible: boolean;
    toggleGuide: () => void;
    setGuideVisible: (on: boolean) => void;
}

const ProgressionContext = createContext<ProgressionContextType | undefined>(undefined);

// Stable fallbacks while no series is active, so consumers' memo deps don't churn.
const EMPTY_COLLECTION: Collection = {};
const GUIDE_KEY = "ygo-guide";

/** Whether Yugi is on: kept in localStorage, with this visit's value as a fallback when storage is blocked. */
const guideStore = (() => {
    let fallback = true;
    const listeners = new Set<() => void>();
    return {
        get: () => {
            try {
                return localStorage.getItem(GUIDE_KEY) === null ? fallback : localStorage.getItem(GUIDE_KEY) !== "off";
            } catch {
                return fallback;
            }
        },
        set: (on: boolean) => {
            fallback = on;
            try {
                localStorage.setItem(GUIDE_KEY, on ? "on" : "off");
            } catch {
                /* storage blocked: the choice lasts this visit */
            }
            if (!on) guide.silence();
            listeners.forEach((l) => l());
        },
        subscribe: (l: () => void) => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
    };
})();
const EMPTY: never[] = [];

export function ProgressionProvider({ children }: { children: ReactNode }) {
    const { user, loading: authLoading } = useAuth();
    const userId = user?.id ?? null;
    const repo = useMemo<GameRepository>(() => (userId ? new RemoteRepo(userId) : new LocalRepo()), [userId]);

    const [seriesList, setSeriesList] = useState<SeriesSummary[]>([]);
    const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
    const [active, setActive] = useState<{ series: SeriesView; me: PlayerView } | null>(null);
    const [hasLoaded, setHasLoaded] = useState(false);

    const reloadActive = useCallback(async (id: string | null) => {
        setActive(id ? await repo.loadSeries(id) : null);
    }, [repo]);

    // Load the list and the remembered series whenever the player (and so the repo) changes.
    useEffect(() => {
        if (authLoading) return;
        let cancelled = false;
        (async () => {
            const list = await repo.listSeries().catch(() => []);
            const remembered = repo.activeSeriesId();
            const id = list.some((s) => s.id === remembered) ? remembered : null;
            const loaded = id ? await repo.loadSeries(id).catch(() => null) : null;
            if (cancelled) return;
            setSeriesList(list);
            setActiveSeriesId(loaded ? id : null);
            setActive(loaded);
            setHasLoaded(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [repo, authLoading]);

    const refreshList = useCallback(async () => setSeriesList(await repo.listSeries()), [repo]);

    const refresh = useCallback(async (seriesId?: string) => {
        await refreshList();
        if (activeSeriesId && (!seriesId || seriesId === activeSeriesId)) await reloadActive(activeSeriesId);
    }, [refreshList, reloadActive, activeSeriesId]);

    const loadSeries = async (id: string) => {
        repo.setActiveSeriesId(id);
        setActiveSeriesId(id);
        await reloadActive(id);
    };

    const createSeries = async (input: CreateSeriesInput) => {
        const id = await repo.createSeries(input);
        await refreshList();
        await loadSeries(id);
        return id;
    };

    const deleteSeries = async (id: string) => {
        await repo.deleteSeries(id);
        if (id === activeSeriesId) {
            repo.setActiveSeriesId(null);
            setActiveSeriesId(null);
            setActive(null);
        }
        await refreshList();
    };

    /** Runs a command on the active series, then reloads it unless told not to. */
    const onActive = <T,>(command: (id: string) => Promise<T>, reload = true) => async (): Promise<T> => {
        if (!activeSeriesId) throw new RepoError('Pick a save first');
        const result = await command(activeSeriesId);
        if (reload) await reloadActive(activeSeriesId);
        return result;
    };

    // Marks change at once on screen; the repository catches up behind (no reload for a mark).
    // Edits belong to one series: switching runs starts from that run's own marks.
    const [markEdits, setMarkEdits] = useState<{ series: string | null; edits: ReadonlyMap<number, boolean> }>({ series: null, edits: new Map() });
    const savedMarks = active?.me.marks;
    const edits = markEdits.series === activeSeriesId ? markEdits.edits : null;
    const marks = useMemo(() => {
        const all = new Set(savedMarks ?? []);
        for (const [cardId, on] of edits ?? []) {
            if (on) all.add(cardId);
            else all.delete(cardId);
        }
        return all as ReadonlySet<number>;
    }, [savedMarks, edits]);
    const setMark = (cardId: number, on: boolean) => {
        if (!activeSeriesId || marks.has(cardId) === on) return;
        const series = activeSeriesId;
        const edit = (value: boolean) =>
            setMarkEdits((m) => ({ series, edits: new Map(m.series === series ? m.edits : []).set(cardId, value) }));
        edit(on);
        repo.setMark(activeSeriesId, cardId, on).catch((e) => {
            edit(!on);
            alertRepoError(e);
        });
    };

    // Yugi on or off, remembered on this device (the nav's Yugi button and the menu's Options).
    const isGuideVisible = useSyncExternalStore(guideStore.subscribe, guideStore.get, () => true);
    const setGuide = guideStore.set;

    return (
        <ProgressionContext.Provider value={{
            repo,
            hasLoaded,

            seriesList,
            activeSeriesId,
            series: active?.series ?? null,
            me: active?.me ?? null,

            currentSetIndex: active?.series.currentSetIndex ?? 0,
            collection: active?.me.collection ?? EMPTY_COLLECTION,
            matchHistory: active?.series.matchHistory ?? EMPTY,
            rewards: active?.me.rewards ?? EMPTY,
            bannedCardIds: active?.series.bannedCardIds ?? EMPTY,
            savedDecks: active?.me.savedDecks ?? EMPTY,

            createSeries,
            loadSeries,
            deleteSeries,
            refresh,

            openPacks: (options) => onActive((id) => repo.openPacks(id, options), false)(),
            activeOpening: (kind) => onActive((id) => repo.activeOpening(id, kind), false)(),
            flip: (openingId, flipped) => onActive((id) => repo.flip(id, openingId, flipped), false)(),
            saveOpening: (openingId) => onActive((id) => repo.saveOpening(id, openingId))(),
            reroll: (openingId) => onActive((id) => repo.reroll(id, openingId))(),
            reportMatch: (won) => onActive((id) => repo.reportMatch(id, won))(),
            confirmReport: (reportId) => onActive((id) => repo.confirmReport(id, reportId))(),
            rejectReport: (reportId) => onActive((id) => repo.rejectReport(id, reportId))(),
            spin: (rewardId) => onActive((id) => repo.spin(id, rewardId))(),
            claimReward: (rewardId, cardId, printing) => onActive((id) => repo.claimReward(id, rewardId, cardId, printing))(),
            rivalBinder: () => onActive((id) => repo.rivalBinder(id), false)(),
            rivalRewards: () => onActive((id) => repo.rivalRewards(id), false)(),
            marks,
            setMark,
            saveDeck: (deck) => onActive((id) => repo.saveDeck(id, deck))(),
            deleteDeck: (deckId) => onActive((id) => repo.deleteDeck(id, deckId))(),
            importCollection: (cardIds, mode) => onActive((id) => repo.importCollection(id, cardIds, mode))(),

            isGuideVisible,
            toggleGuide: () => setGuide(!isGuideVisible),
            setGuideVisible: setGuide,
        }}>
            {children}
        </ProgressionContext.Provider>
    );
}

export function useProgression() {
    const context = useContext(ProgressionContext);
    if (context === undefined) {
        throw new Error('useProgression must be used within a ProgressionProvider');
    }
    return context;
}

/** Shows a refusal to the player; anything unexpected is rethrown. */
export function alertRepoError(error: unknown) {
    if (error instanceof RepoError) void gameAlert(error.message, { title: "Hold on" });
    else throw error;
}
