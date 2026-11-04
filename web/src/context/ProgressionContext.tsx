"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
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
import { RewardEntry, WheelPrize } from '@/lib/rewards';
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

    createSeries: (input: CreateSeriesInput) => Promise<void>;
    loadSeries: (id: string) => Promise<void>;
    deleteSeries: (id: string) => Promise<void>;

    // Commands on the active series; refusals throw RepoError with a message to show.
    openPacks: (options?: OpenOptions) => Promise<Opening>;
    activeOpening: (kind: 'set' | 'reward') => Promise<Opening | null>;
    flip: (openingId: string, flipped: number[]) => Promise<void>;
    saveOpening: (openingId: string) => Promise<void>;
    reroll: (openingId: string) => Promise<Opening>;
    reportMatch: (won: boolean) => Promise<ReportOutcome>;
    spin: (rewardId: string) => Promise<WheelPrize>;
    claimReward: (rewardId: string, cardId?: number) => Promise<Opening | null>;
    saveDeck: (deck: SavedDeck) => Promise<void>;
    deleteDeck: (deckId: string) => Promise<void>;
    importCollection: (cardIds: number[], mode: 'add' | 'replace') => Promise<void>;

    isGuideVisible: boolean;
    toggleGuide: () => void;
}

const ProgressionContext = createContext<ProgressionContextType | undefined>(undefined);

// Stable fallbacks while no series is active, so consumers' memo deps don't churn.
const EMPTY_COLLECTION: Collection = {};
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

    const refreshList = async () => setSeriesList(await repo.listSeries());

    const loadSeries = async (id: string) => {
        repo.setActiveSeriesId(id);
        setActiveSeriesId(id);
        await reloadActive(id);
    };

    const createSeries = async (input: CreateSeriesInput) => {
        const id = await repo.createSeries(input);
        await refreshList();
        await loadSeries(id);
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

    const [isGuideVisible, setIsGuideVisible] = useState(true);

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

            openPacks: (options) => onActive((id) => repo.openPacks(id, options), false)(),
            activeOpening: (kind) => onActive((id) => repo.activeOpening(id, kind), false)(),
            flip: (openingId, flipped) => onActive((id) => repo.flip(id, openingId, flipped), false)(),
            saveOpening: (openingId) => onActive((id) => repo.saveOpening(id, openingId))(),
            reroll: (openingId) => onActive((id) => repo.reroll(id, openingId))(),
            reportMatch: (won) => onActive((id) => repo.reportMatch(id, won))(),
            spin: (rewardId) => onActive((id) => repo.spin(id, rewardId))(),
            claimReward: (rewardId, cardId) => onActive((id) => repo.claimReward(id, rewardId, cardId))(),
            saveDeck: (deck) => onActive((id) => repo.saveDeck(id, deck))(),
            deleteDeck: (deckId) => onActive((id) => repo.deleteDeck(id, deckId))(),
            importCollection: (cardIds, mode) => onActive((id) => repo.importCollection(id, cardIds, mode))(),

            isGuideVisible,
            toggleGuide: () => setIsGuideVisible((v) => !v),
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
    if (error instanceof RepoError) alert(error.message);
    else throw error;
}
