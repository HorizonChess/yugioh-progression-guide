"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Card, PulledCard } from '@/lib/api';

interface MatchResult {
    winner: 'player' | 'opponent';
    packName: string;
    date: string;
}

export interface RewardState {
    type: 'wheel' | 'pity';
    claimed: boolean;
}

// The core data for a single run
export interface SaveSlot {
    id: string;
    name: string;
    createdAt: number;
    lastPlayed: number;

    // Game State
    currentSetIndex: number;
    collection: Record<string, number>; // Key: `${id}_${set}_${rarity}`
    matchHistory: MatchResult[];
    pendingReward: RewardState | null;

    // Settings
    settings: {
        startSetIndex: number;
        packsPerRound: number;
    };
}

interface ProgressionContextType {
    // Global State
    saves: SaveSlot[];
    activeSaveId: string | null;
    hasLoaded: boolean;
    hasStarted: boolean;

    // Active Save Data (Convenience accessors for current UI)
    currentSetIndex: number;
    collection: Record<string, number>;
    matchHistory: MatchResult[];
    pendingReward: RewardState | null;

    // Actions
    createSave: (name: string, startSetIndex?: number, packsPerRound?: number) => void;
    loadSave: (id: string) => void;
    deleteSave: (id: string) => void;
    startSeries: () => void;

    // Game Actions (Apply to active save)
    addToCollection: (cards: PulledCard[]) => void;
    recordMatch: (result: MatchResult) => void;
    advanceSet: () => void;
    claimReward: () => void;
    resetProgress: () => void; // Resets ACTIVE save
    importCollection: (cardIds: number[], mode: 'add' | 'replace') => void;

    // Guide
    isGuideVisible: boolean;
    toggleGuide: () => void;
}

const ProgressionContext = createContext<ProgressionContextType | undefined>(undefined);

const STORAGE_KEY = 'yugioh-progression-saves-v2';
const LEGACY_KEY = 'yugioh-progression-save';

export function ProgressionProvider({ children }: { children: ReactNode }) {
    const [saves, setSaves] = useState<SaveSlot[]>([]);
    const [activeSaveId, setActiveSaveId] = useState<string | null>(null);
    const [hasLoaded, setHasLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        const loadData = () => {
            try {
                // 1. Try loading new v2 format
                const savedV2 = localStorage.getItem(STORAGE_KEY);
                if (savedV2) {
                    const parsed = JSON.parse(savedV2);
                    setSaves(parsed.saves || []);
                    setActiveSaveId(parsed.activeSaveId || null);
                } else {
                    // 2. Check for legacy data to migrate
                    const legacy = localStorage.getItem(LEGACY_KEY);
                    if (legacy) {
                        const parsedLegacy = JSON.parse(legacy);

                        // Migrate legacy collection (number keys) to string keys
                        const legacyCollection = parsedLegacy.collection || {};
                        const migratedCollection: Record<string, number> = {};

                        Object.entries(legacyCollection).forEach(([id, count]) => {
                            // Legacy data has no set/rarity info, so we use a placeholder
                            // We'll use "Unknown" set and "Common" rarity as fallback
                            // Format: ID_SET_RARITY
                            const key = `${id}_Unknown_Common`;
                            migratedCollection[key] = count as number;
                        });

                        const legacySave: SaveSlot = {
                            id: 'legacy-1',
                            name: 'Legacy Run',
                            createdAt: Date.now(),
                            lastPlayed: Date.now(),
                            currentSetIndex: parsedLegacy.currentSetIndex || 0,
                            collection: migratedCollection,
                            matchHistory: parsedLegacy.matchHistory || [],
                            pendingReward: parsedLegacy.pendingReward || null,
                            settings: { startSetIndex: 0, packsPerRound: 24 }
                        };
                        setSaves([legacySave]);
                        setActiveSaveId(legacySave.id);
                    }
                }
            } catch (e) {
                console.error("Failed to load saves", e);
            } finally {
                setHasLoaded(true);
            }
        };
        loadData();
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        if (hasLoaded) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ saves, activeSaveId }));
        }
    }, [saves, activeSaveId, hasLoaded]);

    // Helper to update active save
    const updateActiveSave = (updater: (save: SaveSlot) => SaveSlot) => {
        if (!activeSaveId) return;
        setSaves(prev => prev.map(save =>
            save.id === activeSaveId
                ? { ...updater(save), lastPlayed: Date.now() }
                : save
        ));
    };

    // --- Save Management ---

    const createSave = (name: string, startSetIndex = 0, packsPerRound = 24) => {
        const newSave: SaveSlot = {
            id: crypto.randomUUID(),
            name,
            createdAt: Date.now(),
            lastPlayed: Date.now(),
            currentSetIndex: startSetIndex,
            collection: {},
            matchHistory: [],
            pendingReward: null,
            settings: { startSetIndex, packsPerRound }
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
        if (confirm("Are you sure you want to delete this save file?")) {
            setSaves(prev => prev.filter(s => s.id !== id));
            if (activeSaveId === id) setActiveSaveId(null);
        }
    };

    // --- Game Actions ---

    const addToCollection = (cards: PulledCard[]) => {
        updateActiveSave(save => {
            const newCollection = { ...save.collection };
            cards.forEach(card => {
                // Key: ID_SET_RARITY
                // Sanitize set code and rarity to avoid separator issues (though unlikely with _)
                const key = `${card.id}_${card.pulled_set_code}_${card.pulled_rarity}`;
                newCollection[key] = (newCollection[key] || 0) + 1;
            });
            return { ...save, collection: newCollection };
        });
    };

    const recordMatch = (result: MatchResult) => {
        updateActiveSave(save => ({
            ...save,
            matchHistory: [...save.matchHistory, result],
            pendingReward: {
                type: result.winner === 'player' ? 'wheel' : 'pity',
                claimed: false
            }
        }));
    };

    const advanceSet = () => {
        updateActiveSave(save => ({
            ...save,
            currentSetIndex: save.currentSetIndex + 1
        }));
    };

    const claimReward = () => {
        updateActiveSave(save => ({
            ...save,
            pendingReward: null
        }));
    };

    const resetProgress = () => {
        if (!activeSaveId) return;
        if (confirm("Reset current run?")) {
            updateActiveSave(save => ({
                ...save,
                currentSetIndex: save.settings.startSetIndex,
                collection: {},
                matchHistory: [],
                pendingReward: null
            }));
        }
    };

    const importCollection = (cardIds: number[], mode: 'add' | 'replace') => {
        if (!activeSaveId) return;

        setSaves(prev => {
            const updatedSaves = prev.map(s => {
                if (s.id === activeSaveId) {
                    let newCollection = mode === 'replace' ? {} : { ...s.collection };

                    cardIds.forEach(id => {
                        // Imported cards have no set/rarity info
                        const key = `${id}_Unknown_Common`;
                        newCollection[key] = (newCollection[key] || 0) + 1;
                    });

                    return {
                        ...s,
                        collection: newCollection,
                        lastPlayed: Date.now()
                    };
                }
                return s;
            });

            // Force save immediately
            if (hasLoaded) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ saves: updatedSaves, activeSaveId }));
            }

            return updatedSaves;
        });
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
            hasStarted: !!activeSaveId,

            // Expose active save data directly for backward compatibility
            currentSetIndex: activeSave?.currentSetIndex ?? 0,
            collection: activeSave?.collection ?? {},
            matchHistory: activeSave?.matchHistory ?? [],
            pendingReward: activeSave?.pendingReward ?? null,

            createSave,
            loadSave,
            deleteSave,
            startSeries: () => createSave("New Journey"),

            addToCollection,
            recordMatch,
            advanceSet,
            claimReward,
            resetProgress,
            importCollection,

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
