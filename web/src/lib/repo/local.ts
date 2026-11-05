import {
    PITY_PRIZE,
    REWARD_PACKS,
    SPIN_PRIZE,
    resolvePrizeKind,
    resolveSetIndex,
    starlightGrant,
    timelineSets,
    tournamentSetFor,
    wheelPrizesFor,
    wildcardGrant,
    type Grant,
} from "@ygo/shared";
import { fetchCardsByIds, fetchCardsInSet, fetchRawSets, fetchSetDateMap, fetchTournamentSets, type CardSet, type PulledCard } from "@/lib/api";
import { collectionKey, type Collection } from "@/lib/collection";
import { generateBoosterPack } from "@/lib/pack-logic";
import type { RewardEntry } from "@/lib/rewards";
import { reconcileSaves } from "@/lib/set-position";
import { loadPersistedState, persistState, type SaveSlot } from "@/lib/storage";
import { RepoError, type CreateSeriesInput, type GameRepository, type Opening, type OpenOptions } from "./types";

function addCards(collection: Collection, cards: { id: number; setCode: string; rarity: string }[]): Collection {
    const next = { ...collection };
    for (const c of cards) {
        const key = collectionKey(c.id, c.setCode, c.rarity);
        next[key] = (next[key] ?? 0) + 1;
    }
    return next;
}

const DUO_ONLY = "Duo series need an account";

const pulled = (cards: PulledCard[]) => cards.map((c) => ({ id: c.id, setCode: c.pulled_set_code, rarity: c.pulled_rarity }));

async function rollPacks(set: CardSet, count: number): Promise<PulledCard[][]> {
    const cards = await fetchCardsInSet(set.set_name);
    if (!cards.length) throw new RepoError(`Couldn't load the cards of ${set.set_name}`);
    return Array.from({ length: count }, () => generateBoosterPack(cards, set));
}

/** Guest play: saves live in this browser's localStorage. */
export class LocalRepo implements GameRepository {
    readonly kind = "local";
    readonly freePacks = true;
    /** Guest openings aren't resumable, so they live only in memory. */
    private openings = new Map<string, { saveId: string; opening: Opening }>();

    private async load() {
        const raw = await fetchRawSets();
        const state = loadPersistedState();
        const saves = reconcileSaves(state.saves, raw);
        if (saves !== state.saves) persistState({ ...state, saves });
        return { state: { ...state, saves }, timeline: timelineSets(raw) };
    }

    private async save(id: string) {
        const { state, timeline } = await this.load();
        const save = state.saves.find((s) => s.id === id);
        if (!save) throw new RepoError("This save no longer exists");
        return { state, timeline, save };
    }

    private async update(id: string, change: (save: SaveSlot, timeline: CardSet[]) => SaveSlot | Promise<SaveSlot>) {
        const { state, timeline, save } = await this.save(id);
        const next = { ...(await change(save, timeline)), lastPlayed: Date.now() };
        persistState({ ...state, saves: state.saves.map((s) => (s.id === id ? next : s)) });
    }

    private summary(save: SaveSlot, timeline: CardSet[]) {
        return {
            id: save.id,
            name: save.name,
            mode: "solo" as const,
            status: "active" as const,
            ownerId: null,
            members: [],
            currentSetIndex: save.currentSetIndex,
            currentSetName: save.currentSetName ?? timeline[save.currentSetIndex]?.set_name ?? null,
            lastPlayed: save.lastPlayed,
        };
    }

    async listSeries() {
        const { state, timeline } = await this.load();
        return [...state.saves].sort((a, b) => b.lastPlayed - a.lastPlayed).map((s) => this.summary(s, timeline));
    }

    async createSeries({ name, startSetIndex, packsPerSet }: CreateSeriesInput) {
        const { state, timeline } = await this.load();
        const now = Date.now();
        const save: SaveSlot = {
            id: crypto.randomUUID(),
            name,
            createdAt: now,
            lastPlayed: now,
            currentSetIndex: startSetIndex,
            ...(timeline[startSetIndex] ? { currentSetName: timeline[startSetIndex].set_name } : {}),
            setOrder: 2,
            collection: {},
            matchHistory: [],
            rewards: [],
            bannedCardIds: [],
            settings: { startSetIndex, packsPerRound: packsPerSet },
            savedDecks: [],
        };
        persistState({ ...state, saves: [...state.saves, save] });
        return save.id;
    }

    async deleteSeries(id: string) {
        const { state } = await this.load();
        persistState({ saves: state.saves.filter((s) => s.id !== id), activeSaveId: state.activeSaveId === id ? null : state.activeSaveId });
    }

    async loadSeries(id: string) {
        const { timeline, save } = await this.save(id);
        return {
            series: {
                ...this.summary(save, timeline),
                rules: { startSetIndex: save.settings.startSetIndex, packsPerSet: save.settings.packsPerRound },
                finished: save.currentSetIndex >= timeline.length,
                bannedCardIds: save.bannedCardIds,
                matchHistory: save.matchHistory,
                pendingReport: null,
                openingsSaved: [],
            },
            me: { collection: save.collection, savedDecks: save.savedDecks, rewards: save.rewards, ydkImportUsed: false },
        };
    }

    activeSeriesId() {
        return loadPersistedState().activeSaveId;
    }

    setActiveSeriesId(id: string | null) {
        persistState({ ...loadPersistedState(), activeSaveId: id });
    }

    private keep(saveId: string, source: Opening["source"], set: CardSet, packs: PulledCard[][]): Opening {
        const opening: Opening = { id: crypto.randomUUID(), source, setName: set.set_name, packs, flipped: [] };
        this.openings.set(opening.id, { saveId, opening });
        return opening;
    }

    private opening(saveId: string, openingId: string) {
        const entry = this.openings.get(openingId);
        if (!entry || entry.saveId !== saveId) throw new RepoError("No such opening");
        return entry.opening;
    }

    async openPacks(id: string, { quantity, setIndex }: OpenOptions = {}) {
        const { timeline, save } = await this.save(id);
        const index = setIndex ?? save.currentSetIndex;
        const set = index <= save.currentSetIndex ? timeline[index] : undefined;
        if (!set) throw new RepoError("That set isn't open to you yet");
        return this.keep(id, "set", set, await rollPacks(set, quantity ?? save.settings.packsPerRound));
    }

    async activeOpening() {
        return null;
    }

    async flip(id: string, openingId: string, flipped: number[]) {
        const opening = this.opening(id, openingId);
        opening.flipped = [...new Set([...opening.flipped, ...flipped])];
    }

    async saveOpening(id: string, openingId: string) {
        const opening = this.opening(id, openingId);
        await this.update(id, (save) => ({ ...save, collection: addCards(save.collection, pulled(opening.packs.flat())) }));
        this.openings.delete(openingId);
    }

    async reroll(id: string, openingId: string) {
        const old = this.opening(id, openingId);
        let fresh = null as Opening | null;
        await this.update(id, async (save, timeline) => {
            const ticket = save.rewards.find((r) => r.prizeId === "redoer-ticket" && r.status === "available");
            if (!ticket) throw new RepoError("You have no Redoer Ticket");
            const set = timeline.find((s) => s.set_name === old.setName);
            if (!set) throw new RepoError("This set is no longer available");
            fresh = this.keep(id, old.source, set, await rollPacks(set, old.packs.length));
            return { ...save, rewards: claim(save.rewards, ticket.id, {}) };
        });
        this.openings.delete(openingId);
        return fresh!;
    }

    async reportMatch(id: string, won: boolean) {
        let reward = null as RewardEntry | null;
        await this.update(id, (save, timeline) => {
            const index = resolveSetIndex(timeline, save.currentSetName, save.currentSetIndex);
            const set = timeline[index];
            if (!set) throw new RepoError("This run has played every set");
            const now = new Date().toISOString();
            reward = {
                id: crypto.randomUUID(),
                prizeId: won ? SPIN_PRIZE.id : PITY_PRIZE.id,
                wonFromPackName: set.set_name,
                wonFromSetIndex: index,
                wonDate: now,
                status: "available",
            };
            const nextName = timeline[index + 1]?.set_name;
            const { currentSetName: _previous, ...rest } = save;
            void _previous;
            return {
                ...rest,
                currentSetIndex: index + 1,
                ...(nextName ? { currentSetName: nextName } : {}),
                setOrder: 2 as const,
                matchHistory: [...save.matchHistory, { winner: won ? "player" : "opponent", packName: set.set_name, date: now }],
                rewards: [...save.rewards, reward],
            };
        });
        return { status: "applied" as const, reward: reward! };
    }

    // Guests play solo, so there's never a rival to answer or rob.
    async confirmReport(): Promise<RewardEntry> {
        throw new RepoError(DUO_ONLY);
    }

    async rejectReport(): Promise<void> {
        throw new RepoError(DUO_ONLY);
    }

    async rivalBinder(): Promise<Collection> {
        throw new RepoError(DUO_ONLY);
    }

    async spin(id: string, rewardId: string) {
        const prizes = wheelPrizesFor("solo");
        const prize = prizes[Math.floor(Math.random() * prizes.length)]!;
        await this.update(id, (save) => {
            if (!save.rewards.some((r) => r.id === rewardId && r.prizeId === SPIN_PRIZE.id && r.status === "available")) {
                throw new RepoError("No unspun reward with that id");
            }
            return { ...save, rewards: save.rewards.map((r) => (r.id === rewardId ? { ...r, prizeId: prize.id } : r)) };
        });
        return prize;
    }

    async claimReward(id: string, rewardId: string, cardId?: number) {
        let opened = null as Opening | null;
        await this.update(id, async (save, timeline) => {
            const reward = save.rewards.find((r) => r.id === rewardId);
            if (!reward || reward.status !== "available") throw new RepoError("This reward was already claimed");
            const anchor = timeline[resolveSetIndex(timeline, reward.wonFromPackName, reward.wonFromSetIndex)];
            if (!anchor) throw new RepoError("The set this reward came from is no longer available");
            const kind = resolvePrizeKind(reward.prizeId);

            const pickCard = () => {
                if (cardId === undefined) throw new RepoError("Pick a card");
                return cardId;
            };
            const granting = (grant: Grant | null | undefined, card: number) => {
                if (!grant) throw new RepoError("That card isn't eligible for this reward");
                return { ...save, collection: addCards(save.collection, [{ id: card, ...grant }]), rewards: claim(save.rewards, rewardId, { grantedCardId: card }) };
            };

            switch (kind) {
                case "wildcard": {
                    const card = pickCard();
                    const found = (await fetchCardsInSet(anchor.set_name)).find((c) => c.id === card);
                    return granting(found && wildcardGrant(found, anchor, reward.prizeId), card);
                }
                case "starlight": {
                    const card = pickCard();
                    const [found] = await fetchCardsByIds([card]);
                    return granting(found && starlightGrant(found, anchor.tcg_date, await fetchSetDateMap()), card);
                }
                case "ban":
                case "unban": {
                    const card = pickCard();
                    const banned = save.bannedCardIds.includes(card);
                    if (banned === (kind === "ban")) throw new RepoError("That card isn't eligible for this reward");
                    return {
                        ...save,
                        bannedCardIds: kind === "ban" ? [...save.bannedCardIds, card] : save.bannedCardIds.filter((c) => c !== card),
                        rewards: claim(save.rewards, rewardId, { bannedCardId: card }),
                    };
                }
                case "pity":
                case "tournament": {
                    const set = kind === "pity" ? anchor : tournamentSetFor(await fetchTournamentSets(), anchor.tcg_date);
                    if (!set) throw new RepoError("No tournament packs are available");
                    opened = this.keep(id, kind, set, await rollPacks(set, REWARD_PACKS));
                    return { ...save, rewards: claim(save.rewards, rewardId, {}) };
                }
                default:
                    throw new RepoError(kind === "spin" ? "Spin the wheel first" : "This reward isn't claimed here");
            }
        });
        return opened;
    }

    async saveDeck(id: string, deck: Parameters<GameRepository["saveDeck"]>[1]) {
        await this.update(id, (save) => {
            const exists = save.savedDecks.some((d) => d.id === deck.id);
            return { ...save, savedDecks: exists ? save.savedDecks.map((d) => (d.id === deck.id ? deck : d)) : [...save.savedDecks, deck] };
        });
    }

    async deleteDeck(id: string, deckId: string) {
        await this.update(id, (save) => ({ ...save, savedDecks: save.savedDecks.filter((d) => d.id !== deckId) }));
    }

    async importCollection(id: string, cardIds: number[], mode: "add" | "replace") {
        await this.update(id, (save) => {
            // Imported cards carry no set or rarity.
            const collection: Collection = mode === "replace" ? {} : { ...save.collection };
            for (const cardId of cardIds) collection[collectionKey(cardId)] = (collection[collectionKey(cardId)] ?? 0) + 1;
            return { ...save, collection };
        });
    }
}

function claim(rewards: RewardEntry[], rewardId: string, payload: Partial<RewardEntry>): RewardEntry[] {
    return rewards.map((r) => (r.id === rewardId ? { ...r, ...payload, status: "claimed" as const, claimedDate: new Date().toISOString() } : r));
}
