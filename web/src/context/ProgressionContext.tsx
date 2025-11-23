"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Card } from '@/lib/api';

interface MatchResult {
    winner: 'player' | 'opponent'; // 'player' is user, 'opponent' is friend/AI
    packName: string; // The set name where this match happened
    date: string;
}

export interface RewardState {
    type: 'wheel' | 'pity';
    claimed: boolean;
}

interface ProgressionState {
    currentSetIndex: number;
    collection: Record<number, number>; // cardId -> count
    matchHistory: MatchResult[];
    pendingReward: RewardState | null;
    hasLoaded: boolean;
    hasStarted: boolean;
}

interface ProgressionContextType extends ProgressionState {
    addToCollection: (cards: Card[]) => void;
    recordMatch: (result: MatchResult) => void;
    advanceSet: () => void;
    claimReward: () => void;
    resetProgress: () => void;
    startSeries: () => void;
}

const ProgressionContext = createContext<ProgressionContextType | undefined>(undefined);

const STORAGE_KEY = 'yugioh-progression-save';

export function ProgressionProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<ProgressionState>({
        currentSetIndex: 0,
        collection: {},
        matchHistory: [],
        pendingReward: null,
        hasLoaded: false,
        hasStarted: false,
    });

    // Load from localStorage on mount
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setState({ ...parsed, hasLoaded: true });
            } catch (e) {
                console.error("Failed to load save", e);
                setState(s => ({ ...s, hasLoaded: true }));
            }
        } else {
            setState(s => ({ ...s, hasLoaded: true }));
        }
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        if (state.hasLoaded) {
            const { hasLoaded, ...saveData } = state;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
        }
    }, [state]);

    const addToCollection = (cards: Card[]) => {
        setState(prev => {
            const newCollection = { ...prev.collection };
            cards.forEach(card => {
                newCollection[card.id] = (newCollection[card.id] || 0) + 1;
            });
            return { ...prev, collection: newCollection };
        });
    };

    const recordMatch = (result: MatchResult) => {
        setState(prev => ({
            ...prev,
            matchHistory: [...prev.matchHistory, result],
            pendingReward: {
                type: result.winner === 'player' ? 'wheel' : 'pity',
                claimed: false
            }
        }));
    };

    const advanceSet = () => {
        setState(prev => ({
            ...prev,
            currentSetIndex: prev.currentSetIndex + 1
        }));
    };

    const claimReward = () => {
        setState(prev => ({
            ...prev,
            pendingReward: null
        }));
    };

    const resetProgress = () => {
        if (confirm("Are you sure you want to reset all progress? This cannot be undone.")) {
            const newState = {
                currentSetIndex: 0,
                collection: {},
                matchHistory: [],
                pendingReward: null,
                hasLoaded: true,
                hasStarted: false
            };
            setState(newState);
            localStorage.removeItem(STORAGE_KEY);
        }
    };

    const startSeries = () => {
        setState({
            currentSetIndex: 0,
            collection: {},
            matchHistory: [],
            pendingReward: null,
            hasLoaded: true,
            hasStarted: true
        });
    };

    return (
        <ProgressionContext.Provider value={{
            ...state,
            addToCollection,
            recordMatch,
            advanceSet,
            claimReward,
            resetProgress,
            startSeries
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
