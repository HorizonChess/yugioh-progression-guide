import { DECK_LIMITS, DEFAULT_PACKS_PER_SET, PrintingSchema, isPacksPerSet, type GuestSaveBody } from "@ygo/shared";
import { apiRequest } from "@/lib/repo/remote";
import { loadPersistedState, persistState, type SaveSlot } from "@/lib/storage";

/** The guest saves kept in this browser. */
export const guestSaves = (): SaveSlot[] => loadPersistedState().saves;

const clip = (text: string, fallback: string) => text.trim().slice(0, 40).trim() || fallback;
const index = (n: number) => Math.max(0, Math.floor(n));

/** A save as the server takes it; odd values from old versions are evened out first. */
function toBody(save: SaveSlot): GuestSaveBody {
    return {
        saveId: save.id.replace(/[^\w-]/g, "").slice(0, 64) || "save",
        name: clip(save.name, "Guest Run"),
        startSetIndex: index(save.settings.startSetIndex),
        currentSetIndex: index(save.currentSetIndex),
        ...(save.currentSetName ? { currentSetName: save.currentSetName } : {}),
        packsPerSet: isPacksPerSet(save.settings.packsPerRound) ? save.settings.packsPerRound : DEFAULT_PACKS_PER_SET,
        collection: Object.fromEntries(Object.entries(save.collection).filter(([key]) => PrintingSchema.safeParse(key).success)),
        matchHistory: save.matchHistory.filter((m) => m.packName).map((m) => ({ won: m.winner === "player", setName: m.packName, at: m.date })),
        rewards: save.rewards
            .filter((r) => r.wonFromPackName)
            .map((r) => ({
                prizeId: r.prizeId,
                wonFromPackName: r.wonFromPackName,
                wonFromSetIndex: index(r.wonFromSetIndex),
                wonDate: r.wonDate,
                status: r.status,
                ...(r.claimedDate ? { claimedDate: r.claimedDate } : {}),
                ...(r.grantedCardId ? { grantedCardId: r.grantedCardId } : {}),
                ...(r.grantedCardIds ? { grantedCardIds: r.grantedCardIds } : {}),
                ...(r.bannedCardId ? { bannedCardId: r.bannedCardId } : {}),
            })),
        bannedCardIds: save.bannedCardIds,
        savedDecks: save.savedDecks.map((d) => ({
            id: d.id.replace(/[^\w-]/g, "").slice(0, 64) || crypto.randomUUID(),
            name: clip(d.name, "Untitled Deck"),
            mainDeck: d.mainDeck.slice(0, DECK_LIMITS.main),
            extraDeck: d.extraDeck.slice(0, DECK_LIMITS.extra),
            sideDeck: d.sideDeck.slice(0, DECK_LIMITS.side),
            createdAt: d.createdAt,
        })),
    };
}

function forget(id: string) {
    const state = loadPersistedState();
    persistState({ saves: state.saves.filter((s) => s.id !== id), activeSaveId: state.activeSaveId === id ? null : state.activeSaveId });
}

export interface MoveResult {
    moved: number;
    /** Cards the server doesn't know, left behind. */
    dropped: number;
    failed: string[];
}

/** Moves guest saves into the signed-in account; each leaves this browser once it's there. */
export async function moveGuestSaves(saves: SaveSlot[]): Promise<MoveResult> {
    const result: MoveResult = { moved: 0, dropped: 0, failed: [] };
    for (const save of saves) {
        try {
            result.dropped += (await apiRequest<{ dropped: number }>("POST", "/api/series/import", toBody(save))).dropped;
            forget(save.id);
            result.moved++;
        } catch (error) {
            result.failed.push(`${save.name} (${error instanceof Error ? error.message : "failed"})`);
        }
    }
    return result;
}

export function describeMove({ moved, dropped, failed }: MoveResult): string {
    return [
        moved && `Moved ${moved} save${moved === 1 ? "" : "s"} into your account.`,
        dropped && `${dropped} card${dropped === 1 ? "" : "s"} the game no longer knows stayed behind.`,
        failed.length && `Couldn't move: ${failed.join(", ")}.`,
    ]
        .filter(Boolean)
        .join(" ");
}
