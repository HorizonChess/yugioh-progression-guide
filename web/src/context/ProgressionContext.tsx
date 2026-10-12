"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PulledCard } from '@/lib/api';
import { RewardEntry } from '@/lib/rewards';
import { Collection, collectionKey } from '@/lib/collection';
import {
    MatchResult,
    SavedDeck,
    SaveSlot,
    DEFAULT_PACKS_PER_ROUND,
    loadPersistedState,
    persistState,
    loadDuelistName,
    persistDuelistName,
} from '@/lib/storage';

export type { MatchResult, SavedDeck, SaveSlot } from '@/lib/storage';

interface ProgressionContextType {
    // Global State
    saves: SaveSlot[];
    activeSaveId: string | null;
    hasLoaded: boolean;
    /** The player's name from onboarding; null until they've entered one. */
    duelistName: string | null;
    setDuelistName: (name: string) => void;

    // Active Save Data (Convenience accessors for current UI)
    currentSetIndex: number;
    collection: Collection;
    matchHistory: MatchResult[];
    rewards: RewardEntry[];
    bannedCardIds: number[];
    savedDecks: SavedDeck[];

    // Actions
    createSave: (name: string, startSetIndex?: number, packsPerRound?: number) => void;
    loadSave: (id: string) => void;
    deleteSave: (id: string) => void;

    // Game Actions (Apply to active save)
    addToCollection: (cards: PulledCard[]) => void;
    recordMatch: (result: MatchResult) => void;
    advanceSet: () => void;
    importCollection: (cardIds: number[], mode: 'add' | 'replace') => void;

    // Rewards ledger
    addReward: (entry: Omit<RewardEntry, 'id' | 'status' | 'wonDate'>) => void;
    claimRewardEntry: (rewardId: string, payload?: Partial<RewardEntry>) => void;
    banCard: (cardId: number) => void;
    unbanCard: (cardId: number) => void;

    // Deck Management
    saveDeck: (deck: SavedDeck) => void;
    deleteDeck: (deckId: string) => void;

    // Guide
    isGuideVisible: boolean;
    toggleGuide: () => void;
}

const ProgressionContext = createContext<ProgressionContextType | undefined>(undefined);

// Stable fallbacks while no save is active, so consumers' memo deps don't churn.
const EMPTY_COLLECTION: Collection = {};
const EMPTY: never[] = [];

export function ProgressionProvider({ children }: { children: ReactNode }) {
    const [saves, setSaves] = useState<SaveSlot[]>([]);
    const [activeSaveId, setActiveSaveId] = useState<string | null>(null);
    const [duelistName, setDuelistNameState] = useState<string | null>(null);
    const [hasLoaded, setHasLoaded] = useState(false);

    // Load from localStorage on mount. localStorage doesn't exist during the
    // static prerender, so this has to happen client-side after hydration.
    useEffect(() => {
        const state = loadPersistedState();
        /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
        setSaves(state.saves);
        setActiveSaveId(state.activeSaveId);
        setDuelistNameState(loadDuelistName());
        setHasLoaded(true);
        /* eslint-enable react-hooks/set-state-in-effect */
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        if (hasLoaded) persistState({ saves, activeSaveId });
    }, [saves, activeSaveId, hasLoaded]);

    const setDuelistName = (name: string) => {
        persistDuelistName(name);
        setDuelistNameState(name);
    };

    // Helper to update active save
    const updateActiveSave = (updater: (save: SaveSlot) => SaveSlot) => {
        if (!activeSaveId) return;
        setSaves(prev => prev.map(save =>
            save.id === activeSaveId ? { ...updater(save), lastPlayed: Date.now() } : save
        ));
    };

    // --- Save Management ---

    const createSave = (name: string, startSetIndex = 0, packsPerRound = DEFAULT_PACKS_PER_ROUND) => {
        const newSave: SaveSlot = {
            id: crypto.randomUUID(),
            name,
            createdAt: Date.now(),
            lastPlayed: Date.now(),
            currentSetIndex: startSetIndex,
            collection: {},
            matchHistory: [],
            rewards: [],
            bannedCardIds: [],
            settings: { startSetIndex, packsPerRound },
            savedDecks: []
        };
        setSaves(prev => [...prev, newSave]);
        setActiveSaveId(newSave.id);
    };

    const loadSave = (id: string) => {
        if (saves.find(s => s.id === id)) {
            setActiveSaveId(id);
        }
    };

    const deleteSave = (id: string) => {
        setSaves(prev => prev.filter(s => s.id !== id));
        if (activeSaveId === id) setActiveSaveId(null);
    };

    // --- Game Actions ---

    const addToCollection = (cards: PulledCard[]) => {
        updateActiveSave(save => {
            const newCollection = { ...save.collection };
            cards.forEach(card => {
                const key = collectionKey(card.id, card.pulled_set_code, card.pulled_rarity);
                newCollection[key] = (newCollection[key] ?? 0) + 1;
            });
            return { ...save, collection: newCollection };
        });
    };

    // Append-only now: the reward is created when the outcome is CLAIMED
    // (win → the wheel prize, known only after the spin; loss → the pity prize),
    // via addReward from the record-match page — not here.
    const recordMatch = (result: MatchResult) => {
        updateActiveSave(save => ({
            ...save,
            matchHistory: [...save.matchHistory, result]
        }));
    };

    const advanceSet = () => {
        updateActiveSave(save => ({
            ...save,
            currentSetIndex: save.currentSetIndex + 1
        }));
    };

    // --- Rewards ledger ---

    const addReward = (entry: Omit<RewardEntry, 'id' | 'status' | 'wonDate'>) => {
        updateActiveSave(save => ({
            ...save,
            rewards: [
                ...save.rewards,
                {
                    ...entry,
                    id: crypto.randomUUID(),
                    status: 'available' as const,
                    wonDate: new Date().toISOString()
                }
            ]
        }));
    };

    const claimRewardEntry = (rewardId: string, payload?: Partial<RewardEntry>) => {
        updateActiveSave(save => ({
            ...save,
            rewards: save.rewards.map(r =>
                r.id === rewardId
                    ? { ...r, ...payload, status: 'claimed' as const, claimedDate: new Date().toISOString() }
                    : r
            )
        }));
    };

    const banCard = (cardId: number) => {
        updateActiveSave(save =>
            save.bannedCardIds.includes(cardId)
                ? save
                : { ...save, bannedCardIds: [...save.bannedCardIds, cardId] }
        );
    };

    const unbanCard = (cardId: number) => {
        updateActiveSave(save => ({
            ...save,
            bannedCardIds: save.bannedCardIds.filter(id => id !== cardId)
        }));
    };

    const importCollection = (cardIds: number[], mode: 'add' | 'replace') => {
        updateActiveSave(save => {
            const newCollection: Collection = mode === 'replace' ? {} : { ...save.collection };
            cardIds.forEach(id => {
                // Imported cards have no set/rarity info
                const key = collectionKey(id);
                newCollection[key] = (newCollection[key] ?? 0) + 1;
            });
            return { ...save, collection: newCollection };
        });
    };

    // --- Deck Management ---
    const saveDeck = (deck: SavedDeck) => {
        updateActiveSave(save => {
            const existingIndex = save.savedDecks.findIndex(d => d.id === deck.id);
            const newDecks = [...save.savedDecks];
            if (existingIndex >= 0) {
                newDecks[existingIndex] = deck;
            } else {
                newDecks.push(deck);
            }
            return { ...save, savedDecks: newDecks };
        });
    };

    const deleteDeck = (deckId: string) => {
        updateActiveSave(save => ({
            ...save,
            savedDecks: save.savedDecks.filter(d => d.id !== deckId)
        }));
    };

    // Derived State for Consumers
    const activeSave = saves.find(s => s.id === activeSaveId);

    // Guide Sprite State
    const [isGuideVisible, setIsGuideVisible] = useState(true);
    const toggleGuide = () => setIsGuideVisible(prev => !prev);

    return (
        <ProgressionContext.Provider value={{
            saves,
            activeSaveId,
            hasLoaded,
            duelistName,
            setDuelistName,

            currentSetIndex: activeSave?.currentSetIndex ?? 0,
            collection: activeSave?.collection ?? EMPTY_COLLECTION,
            matchHistory: activeSave?.matchHistory ?? EMPTY,
            savedDecks: activeSave?.savedDecks ?? EMPTY,
            rewards: activeSave?.rewards ?? EMPTY,
            bannedCardIds: activeSave?.bannedCardIds ?? EMPTY,

            createSave,
            loadSave,
            deleteSave,

            addToCollection,
            recordMatch,
            advanceSet,
            importCollection,

            addReward,
            claimRewardEntry,
            banCard,
            unbanCard,

            saveDeck,
            deleteDeck,

            // Guide
            isGuideVisible,
            toggleGuide
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
