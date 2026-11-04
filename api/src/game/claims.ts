import { ObjectId, type ClientSession, type Db, type MongoClient } from 'mongodb';
import {
    existedByCutoff,
    isRarityAtOrBelow,
    resolvePrizeKind,
    resolveSetIndex,
    wildcardRarityFloor,
    type CardSet,
    type RewardEntry,
} from '@ygo/shared';
import type { CardCatalog } from '../cards/catalog';
import { collectionInc, packSessions, rollPacks, type PackSessionDoc } from './packs';
import { findPlayer, seriesCollection, seriesPlayersCollection, type SeriesDoc } from './series';

const REWARD_PACKS = 3;
const SHORT_PRINTS = new Set(['Short Print', 'Super Short Print', 'SP']);

export class ClaimError extends Error {
    constructor(readonly status: 400 | 404 | 409, message: string) {
        super(message);
    }
}

interface Effect {
    payload: Partial<RewardEntry>;
    apply(tx: ClientSession): Promise<unknown>;
    session?: PackSessionDoc;
}

interface Context {
    db: Db;
    catalog: CardCatalog;
    series: SeriesDoc;
    userId: ObjectId;
    reward: RewardEntry;
    anchor: CardSet;
    cardId: number | undefined;
}

/** Validates and resolves one available reward. Returns the opened packs for pity and tournament. */
export async function claimReward(
    mongo: MongoClient,
    { db, catalog, series, userId, rewardId, cardId }: Omit<Context, 'reward' | 'anchor'> & { rewardId: string },
): Promise<PackSessionDoc | null> {
    const reward = (await findPlayer(db, series._id, userId))?.rewards.find((r) => r.id === rewardId);
    if (!reward) throw new ClaimError(404, 'No such reward');
    if (reward.status !== 'available') throw new ClaimError(409, 'This reward was already claimed');
    const timeline = await catalog.timeline();
    const anchor = timeline[resolveSetIndex(timeline, reward.wonFromPackName, reward.wonFromSetIndex)];
    if (!anchor) throw new ClaimError(409, 'The set this reward came from is no longer available');

    const effect = await resolveEffect({ db, catalog, series, userId, reward, anchor, cardId });
    const tx = mongo.startSession();
    try {
        await tx.withTransaction(async () => {
            const set: Record<string, unknown> = { 'rewards.$.status': 'claimed', 'rewards.$.claimedDate': new Date().toISOString() };
            for (const [key, value] of Object.entries(effect.payload)) set[`rewards.$.${key}`] = value;
            const marked = await seriesPlayersCollection(db).updateOne(
                { seriesId: series._id, userId, rewards: { $elemMatch: { id: rewardId, status: 'available' } } },
                { $set: set },
                { session: tx },
            );
            if (!marked.modifiedCount) throw new ClaimError(409, 'This reward was already claimed');
            await effect.apply(tx);
        });
    } finally {
        await tx.endSession();
    }
    return effect.session ?? null;
}

async function resolveEffect(ctx: Context): Promise<Effect> {
    const kind = resolvePrizeKind(ctx.reward.prizeId);
    switch (kind) {
        case 'wildcard':
            return wildcard(ctx);
        case 'starlight':
            return starlight(ctx);
        case 'ban':
        case 'unban':
            return banlist(ctx, kind);
        case 'pity':
        case 'tournament':
            return packs(ctx, kind);
        default:
            throw new ClaimError(409, kind === 'spin' ? 'Spin the wheel first' : "This reward isn't claimed here");
    }
}

function requireCardId(ctx: Context): number {
    if (ctx.cardId === undefined) throw new ClaimError(400, 'Pick a card');
    return ctx.cardId;
}

const notEligible = () => new ClaimError(400, "That card isn't eligible for this reward");

function grantCard(ctx: Context, id: number, setCode: string, rarity: string): Effect {
    const inc = collectionInc([{ id, setCode, rarity }]);
    return {
        payload: { grantedCardId: id },
        apply: (tx) => seriesPlayersCollection(ctx.db).updateOne({ seriesId: ctx.series._id, userId: ctx.userId }, { $inc: inc }, { session: tx }),
    };
}

/** Any card from the won set, at or below the wildcard's rarity. */
async function wildcard(ctx: Context): Promise<Effect> {
    const id = requireCardId(ctx);
    const card = (await ctx.catalog.cardsInSet(ctx.anchor.set_name)).find((c) => c.id === id);
    const ceiling = wildcardRarityFloor(ctx.reward.prizeId);
    const rarity = card?.card_sets
        ?.filter((p) => p.set_name === ctx.anchor.set_name)
        .map((p) => (SHORT_PRINTS.has(p.set_rarity) ? 'Common' : p.set_rarity))
        .find((r) => isRarityAtOrBelow(r, ceiling));
    if (!rarity) throw notEligible();
    return grantCard(ctx, id, ctx.anchor.set_code, rarity);
}

/** Any card with a printing released before the won set, as a Starlight Rare. */
async function starlight(ctx: Context): Promise<Effect> {
    const id = requireCardId(ctx);
    const [card] = await ctx.catalog.cardsByIds([id]);
    const dates = await ctx.catalog.setDates();
    const earliest = (card?.card_sets ?? [])
        .map((p) => ({ code: p.set_code, date: dates.get(p.set_name) }))
        .filter((p): p is { code: string; date: string } => p.date !== undefined && p.date < ctx.anchor.tcg_date)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!earliest) throw notEligible();
    return grantCard(ctx, id, earliest.code, 'Starlight Rare');
}

async function banlist(ctx: Context, kind: 'ban' | 'unban'): Promise<Effect> {
    const id = requireCardId(ctx);
    const banned = ctx.series.bannedCardIds.includes(id);
    if (kind === 'unban' && !banned) throw notEligible();
    if (kind === 'ban') {
        const [card] = await ctx.catalog.cardsByIds([id]);
        if (banned || !card || !existedByCutoff(card,await ctx.catalog.setDates())) throw notEligible();
    }
    const change = kind === 'ban' ? { $addToSet: { bannedCardIds: id } } : { $pull: { bannedCardIds: id } };
    return {
        payload: { bannedCardId: id },
        apply: (tx) =>
            seriesCollection(ctx.db).updateOne(
                { _id: ctx.series._id },
                { ...change, $set: { updatedAt: new Date() }, $inc: { version: 1 } },
                { session: tx },
            ),
    };
}

/** Pity opens the won set; tournament opens the latest tournament set released before it. */
async function packs(ctx: Context, kind: 'pity' | 'tournament'): Promise<Effect> {
    let set = ctx.anchor;
    if (kind === 'tournament') {
        const pool = await ctx.catalog.tournamentSets();
        const before = pool.filter((s) => s.tcg_date < ctx.anchor.tcg_date);
        const chosen = (before.length ? before : pool).at(-1);
        if (!chosen) throw new ClaimError(409, 'No tournament packs are available');
        set = chosen;
    }
    const session: PackSessionDoc = {
        _id: new ObjectId(),
        seriesId: ctx.series._id,
        userId: ctx.userId,
        setIndex: -1,
        setName: set.set_name,
        source: kind,
        rewardId: ctx.reward.id,
        packs: rollPacks(await ctx.catalog.cardsInSet(set.set_name), set, REWARD_PACKS),
        flipped: [],
        stage: 'opening',
        active: true,
        createdAt: new Date(),
    };
    return { payload: {}, session, apply: (tx) => packSessions(ctx.db).insertOne(session, { session: tx }) };
}
