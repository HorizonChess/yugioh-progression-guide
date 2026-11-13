"use client";

import { useSyncExternalStore } from "react";

/*
 * The duelist's own settings for the duel screen, kept in this browser.
 *   sound: the duel's sound effects.
 *   chain: "auto" asks you to respond only when it matters (the rival played something, a trigger,
 *          or a card made for this moment); "always" stops at every chance to activate a card.
 *   mat: the look of the duel mat.
 */
export type DuelMat = "classic" | "stone" | "obsidian";
/** The mats, in the order the duel menu steps through them, with their names. */
export const DUEL_MATS: { id: DuelMat; name: string; note: string }[] = [
    { id: "classic", name: "Classic", note: "The dark mat with fine gold lines" },
    { id: "stone", name: "Carved stone", note: "Slabs of temple sandstone, the zones cut in" },
    { id: "obsidian", name: "Obsidian and gold", note: "Polished black with a gilt rim and glowing zones" },
];
export interface DuelPrefs {
    sound: boolean;
    chain: "auto" | "always";
    mat: DuelMat;
}

const KEY = "duelPrefs";
const DEFAULTS: DuelPrefs = { sound: true, chain: "auto", mat: "classic" };
let current: DuelPrefs | null = null;
const listeners = new Set<() => void>();

export function duelPrefs(): DuelPrefs {
    if (current) return current;
    if (typeof window === "undefined") return DEFAULTS;
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<DuelPrefs>;
        current = { sound: saved.sound !== false, chain: saved.chain === "always" ? "always" : "auto", mat: DUEL_MATS.some((m) => m.id === saved.mat) ? saved.mat! : "classic" };
    } catch {
        current = DEFAULTS;
    }
    return current;
}

export function setDuelPrefs(patch: Partial<DuelPrefs>) {
    current = { ...duelPrefs(), ...patch };
    try {
        localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
        // Private mode: the setting lasts for this visit.
    }
    listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
};

export const useDuelPrefs = () => useSyncExternalStore(subscribe, duelPrefs, () => DEFAULTS);
