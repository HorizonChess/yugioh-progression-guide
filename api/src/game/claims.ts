import { ObjectId, type ClientSession, type Db, type MongoClient } from 'mongodb';
import {
    existedByCutoff,
    parseCollectionKey,
    REWARD_PACKS,
    resolvePrizeKind,
    resolveSetIndex,
    starlightGrant,
    tournamentSetFor,
    wildcardGrant,
    type CardSet,
    type PrizeKind,
    type RewardEntry,
} from '@ygo/shared';
import type { CardCatalog } from '../cards/catalog';
import { collectionInc, packSessions, rollPacks, type PackSessionDoc } from './packs';
import { findPlayer, seriesCollection, seriesPlayersCollection, type SeriesDoc } from './series';


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
    /** Snatch Steal: the collection key of the rival's copy to take. */
    printing: string | undefined;
}

export interface Claimed {
    kind: PrizeKind;
    /** The opened packs, for pity and tournament. */
    session: PackSessionDoc | null;
    /** The card picked, banned or taken. */
    cardId?: number;
}

/** Validates and resolves one available reward. */
export async function claimReward(
    mongo: MongoClient,
    { db, catalog, series, userId, rewardId, cardId, printing }: Omit<Context, 'reward' | 'anchor'> & { rewardId: string },
): Promise<Claimed> {
    const reward = (await findPlayer(db, series._id, userId))?.rewards.find((r) => r.id === rewardId);
    if (!reward) throw new ClaimError(404, 'No such reward');
    if (reward.status !== 'available') throw new ClaimError(409, 'This reward was already claimed');
    const timeline = await catalog.timeline();
    const anchor = timeline[resolveSetIndex(timeline, reward.wonFromPackName, reward.wonFromSetIndex)];
    if (!anchor) throw new ClaimError(409, 'The set this reward came from is no longer available');

    const effect = await resolveEffect({ db, catalog, series, userId, reward, anchor, cardId, printing });
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
    const card = effect.payload.grantedCardId ?? effect.payload.bannedCardId;
    return { kind: resolvePrizeKind(reward.prizeId), session: effect.session ?? null, ...(card === undefined ? {} : { cardId: card }) };
}

async function resolveEffect(ctx: Context): Promise<Effect> {
    const kind = resolvePrizeKind(ctx.reward.prizeId);
    switch (kind) {
        case 'snatch':
            return snatch(ctx);
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

async function wildcard(ctx: Context): Promise<Effect> {
    const id = requireCardId(ctx);
    const card = (await ctx.catalog.cardsInSet(ctx.anchor.set_name)).find((c) => c.id === id);
    const grant = card && wildcardGrant(card, ctx.anchor, ctx.reward.prizeId);
    if (!grant) throw notEligible();
    return grantCard(ctx, id, grant.setCode, grant.rarity);
}

async function starlight(ctx: Context): Promise<Effect> {
    const id = requireCardId(ctx);
    const [card] = await ctx.catalog.cardsByIds([id]);
    const grant = card && starlightGrant(card, ctx.anchor.tcg_date, await ctx.catalog.setDates());
    if (!grant) throw notEligible();
    return grantCard(ctx, id, grant.setCode, grant.rarity);
}

async function banlist(ctx: Context, kind: 'ban' | 'unban'): Promise<Effect> {
    const id = requireCardId(ctx);
    const banned = ctx.series.bannedCardIds.includes(id);
    if (kind === 'unban' && !banned) throw notEligible();
    if (kind === 'ban') {
        const [card] = await ctx.catalog.cardsByIds([id]);
        if (banned || !card || !existedByCutoff(card, await ctx.catalog.setDates())) throw notEligible();
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

/** Moves one copy of a card the rival owns into the player's collection. */
async function snatch(ctx: Context): Promise<Effect> {
    const rivalId = ctx.series.memberIds.find((id) => !id.equals(ctx.userId));
    if (!rivalId) throw new ClaimError(409, 'Snatch Steal needs a rival in the series');
    const key = ctx.printing;
    const entry = key === undefined ? null : parseCollectionKey(key);
    if (!key || !entry) throw new ClaimError(400, 'Pick a card');
    const rival = await findPlayer(ctx.db, ctx.series._id, rivalId);
    if (!rival?.collection[key] || /[.$]/.test(key)) throw notEligible();

    const field = `collection.${key}`;
    const players = seriesPlayersCollection(ctx.db);
    const filter = (userId: ObjectId) => ({ seriesId: ctx.series._id, userId });
    return {
        payload: { grantedCardId: entry.id },
        apply: async (tx) => {
            const taken = await players.updateOne({ ...filter(rivalId), [field]: { $gte: 1 } }, { $inc: { [field]: -1 } }, { session: tx });
            if (!taken.modifiedCount) throw new ClaimError(409, 'Your rival no longer has that card');
            await players.updateOne({ ...filter(rivalId), [field]: { $lte: 0 } }, { $unset: { [field]: '' } }, { session: tx });
            await players.updateOne(filter(ctx.userId), { $inc: { [field]: 1 } }, { session: tx });
        },
    };
}

/** Pity opens the won set; tournament opens the latest tournament set released before it. */
async function packs(ctx: Context, kind: 'pity' | 'tournament'): Promise<Effect> {
    let set = ctx.anchor;
    if (kind === 'tournament') {
        const chosen = tournamentSetFor(await ctx.catalog.tournamentSets(), ctx.anchor.tcg_date);
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
