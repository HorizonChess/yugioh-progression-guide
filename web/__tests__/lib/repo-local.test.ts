import { randomUUID } from "node:crypto";
import { LocalRepo } from "@/lib/repo/local";

// jsdom lacks crypto.randomUUID.
Object.defineProperty(globalThis.crypto, "randomUUID", { value: randomUUID, configurable: true });

const LOB = { set_name: "Legend of Blue Eyes White Dragon", set_code: "LOB", num_of_cards: 100, tcg_date: "2002-03-08" };
const MRD = { set_name: "Metal Raiders", set_code: "MRD", num_of_cards: 100, tcg_date: "2002-06-26" };
const cardsOf = (set: typeof LOB) =>
    Array.from({ length: 40 }, (_, i) => ({
        id: 100 + i,
        name: `Card ${i}`,
        type: "Normal Monster",
        frameType: "normal",
        desc: "",
        card_sets: [{ set_name: set.set_name, set_code: `${set.set_code}-EN${i}`, set_rarity: i % 5 ? "Common" : "Rare", set_rarity_code: "", set_price: "0" }],
        card_images: [],
    }));

jest.mock("@/lib/api", () => ({
    fetchRawSets: jest.fn(async () => [LOB, MRD]),
    fetchCardsInSet: jest.fn(async (name: string) => cardsOf(name === MRD.set_name ? MRD : LOB)),
    fetchCardsByIds: jest.fn(async () => []),
    fetchSetDateMap: jest.fn(async () => new Map()),
    fetchTournamentSets: jest.fn(async () => []),
}));

beforeEach(() => localStorage.clear());

describe("LocalRepo (guest play)", () => {
    it("reports a win into a spin, spins once, and saves pity packs from a loss", async () => {
        const repo = new LocalRepo();
        const id = await repo.createSeries({ name: "Guest", startSetIndex: 0, packsPerSet: 12 });

        const win = await repo.reportMatch(id, true);
        expect(win.status === "applied" && win.reward.prizeId).toBe("wheel-spin");
        const rewardId = win.status === "applied" ? win.reward.id : "";
        const prize = await repo.spin(id, rewardId);
        expect(prize.id).not.toBe("snatch-steal");
        await expect(repo.spin(id, rewardId)).rejects.toThrow(/unspun/);

        const loss = await repo.reportMatch(id, false);
        const pity = await repo.claimReward(id, loss.status === "applied" ? loss.reward.id : "");
        expect(pity?.packs).toHaveLength(3);
        await repo.saveOpening(id, pity!.id);

        const { series, me } = await repo.loadSeries(id);
        expect(series).toMatchObject({ currentSetIndex: 2, finished: true });
        expect(series.matchHistory.map((m) => m.winner)).toEqual(["player", "opponent"]);
        expect(Object.values(me.collection).reduce((a, b) => a + b, 0)).toBe(27);
    });

    it("lets guests open any number of packs from earlier sets, but not later ones", async () => {
        const repo = new LocalRepo();
        const id = await repo.createSeries({ name: "Guest", startSetIndex: 0, packsPerSet: 12 });
        expect((await repo.openPacks(id, { quantity: 2 })).packs).toHaveLength(2);
        expect((await repo.openPacks(id, { quantity: 1 })).packs).toHaveLength(1);
        await expect(repo.openPacks(id, { setIndex: 1 })).rejects.toThrow(/isn't open/);
    });
});
