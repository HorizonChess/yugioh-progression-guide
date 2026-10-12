import { Collection, collectionKey } from '@/lib/collection';
import { RewardEntry, isPrizeId } from '@/lib/rewards';

/**
 * The persisted save model and its localStorage I/O. Everything read back from
 * storage is `unknown` and is narrowed here, so a save written by an older
 * version (or hand-edited) loads with defaults instead of crashing a page.
 */

export interface MatchResult {
    winner: 'player' | 'opponent';
    packName: string;
    date: string;
}

export interface SavedDeck {
    id: string;
    name: string;
    mainDeck: number[];
    extraDeck: number[];
    sideDeck: number[];
    createdAt: number;
}

/** The core data for a single run. */
export interface SaveSlot {
    id: string;
    name: string;
    createdAt: number;
    lastPlayed: number;

    // Game state
    currentSetIndex: number;
    collection: Collection;
    matchHistory: MatchResult[];
    /** Rewards ledger (available + claimed). */
    rewards: RewardEntry[];
    /** Cosmetic deck-builder ban list. */
    bannedCardIds: number[];

    settings: {
        startSetIndex: number;
        packsPerRound: number;
    };
    savedDecks: SavedDeck[];
}

export interface PersistedState {
    saves: SaveSlot[];
    activeSaveId: string | null;
}

const STORAGE_KEY = 'yugioh-progression-saves-v2';
const LEGACY_KEY = 'yugioh-progression-save';
const DUELIST_NAME_KEY = 'duelistName';

export const DEFAULT_PACKS_PER_ROUND = 24;

// --- narrowing helpers ------------------------------------------------------

type UnknownRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is UnknownRecord => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown, fallback: number) => (isNumber(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (isString(v) ? v : fallback);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const numbers = (v: unknown): number[] => list(v).filter(isNumber);

function toCollection(v: unknown): Collection {
    const out: Collection = {};
    if (!isRecord(v)) return out;
    for (const [key, count] of Object.entries(v)) {
        if (isNumber(count) && count > 0) out[key] = count;
    }
    return out;
}

function isMatchResult(v: unknown): v is MatchResult {
    return isRecord(v) && (v.winner === 'player' || v.winner === 'opponent') && isString(v.packName) && isString(v.date);
}

function isRewardEntry(v: unknown): v is RewardEntry {
    return (
        isRecord(v) &&
        isString(v.id) &&
        isPrizeId(v.prizeId) &&
        isString(v.wonFromPackName) &&
        isNumber(v.wonFromSetIndex) &&
        isString(v.wonDate) &&
        (v.status === 'available' || v.status === 'claimed')
    );
}

function toSavedDeck(v: unknown): SavedDeck | null {
    if (!isRecord(v) || !isString(v.id)) return null;
    return {
        id: v.id,
        name: str(v.name, 'Untitled Deck'),
        mainDeck: numbers(v.mainDeck),
        extraDeck: numbers(v.extraDeck),
        sideDeck: numbers(v.sideDeck),
        createdAt: num(v.createdAt, Date.now()),
    };
}

function toSaveSlot(v: unknown): SaveSlot | null {
    if (!isRecord(v) || !isString(v.id)) return null;
    const now = Date.now();
    const settings = isRecord(v.settings) ? v.settings : {};
    return {
        id: v.id,
        name: str(v.name, 'Unnamed Run'),
        createdAt: num(v.createdAt, now),
        lastPlayed: num(v.lastPlayed, now),
        currentSetIndex: num(v.currentSetIndex, 0),
        collection: toCollection(v.collection),
        matchHistory: list(v.matchHistory).filter(isMatchResult),
        rewards: list(v.rewards).filter(isRewardEntry),
        bannedCardIds: numbers(v.bannedCardIds),
        settings: {
            startSetIndex: num(settings.startSetIndex, 0),
            packsPerRound: num(settings.packsPerRound, DEFAULT_PACKS_PER_ROUND),
        },
        savedDecks: list(v.savedDecks)
            .map(toSavedDeck)
            .filter((d): d is SavedDeck => d !== null),
    };
}

/** The pre-v2 single-run save: an id → count collection with no set/rarity info. */
function migrateLegacy(v: unknown): PersistedState {
    if (!isRecord(v)) return { saves: [], activeSaveId: null };
    const collection: Collection = {};
    for (const [id, count] of Object.entries(toCollection(v.collection))) {
        const cardId = parseInt(id, 10);
        if (!Number.isNaN(cardId)) collection[collectionKey(cardId)] = count;
    }
    const now = Date.now();
    const save: SaveSlot = {
        id: 'legacy-1',
        name: 'Legacy Run',
        createdAt: now,
        lastPlayed: now,
        currentSetIndex: num(v.currentSetIndex, 0),
        collection,
        matchHistory: list(v.matchHistory).filter(isMatchResult),
        rewards: [],
        bannedCardIds: [],
        settings: { startSetIndex: 0, packsPerRound: DEFAULT_PACKS_PER_ROUND },
        savedDecks: [],
    };
    return { saves: [save], activeSaveId: save.id };
}

function parseJson(raw: string): unknown {
    return JSON.parse(raw) as unknown;
}

// --- public API ---------------------------------------------------------------

/** Read saves from localStorage (migrating the legacy format if that's all there is). */
export function loadPersistedState(): PersistedState {
    try {
        const v2 = localStorage.getItem(STORAGE_KEY);
        if (v2) {
            const parsed = parseJson(v2);
            if (!isRecord(parsed)) return { saves: [], activeSaveId: null };
            const saves = list(parsed.saves)
                .map(toSaveSlot)
                .filter((s): s is SaveSlot => s !== null);
            const activeSaveId = isString(parsed.activeSaveId) && saves.some((s) => s.id === parsed.activeSaveId)
                ? parsed.activeSaveId
                : null;
            return { saves, activeSaveId };
        }
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) return migrateLegacy(parseJson(legacy));
    } catch (e) {
        console.error('Failed to load saves', e);
    }
    return { saves: [], activeSaveId: null };
}

export function persistState(state: PersistedState): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadDuelistName(): string | null {
    return localStorage.getItem(DUELIST_NAME_KEY);
}

export function persistDuelistName(name: string): void {
    localStorage.setItem(DUELIST_NAME_KEY, name);
}
