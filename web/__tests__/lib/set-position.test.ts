import { timelineSets, type CardSet } from "@ygo/shared";
import { legacyTimelineSets, reconcileSave, reconcileSaves } from "@/lib/set-position";
import type { SaveSlot } from "@/lib/storage";

const set = (set_name: string, tcg_date: string): CardSet => ({ set_name, set_code: "X", num_of_cards: 100, tcg_date });

// As YGOPRODeck might return them: the same-day pair in the "wrong" name order.
const RAW = [
    set("Legend of Blue Eyes White Dragon", "2002-03-08"),
    set("Gladiator's Assault", "2007-11-14"),
    set("Dark Revelation Volume 4", "2007-11-14"),
    set("Phantom Darkness", "2008-02-13"),
];
const TIMELINE = timelineSets(RAW);
const LEGACY = legacyTimelineSets(RAW);

const save = (over: Partial<SaveSlot>): SaveSlot => ({
    id: "s1",
    name: "Run",
    createdAt: 0,
    lastPlayed: 0,
    currentSetIndex: 0,
    collection: {},
    matchHistory: [],
    rewards: [],
    bannedCardIds: [],
    settings: { startSetIndex: 0, packsPerRound: 24 },
    savedDecks: [],
    ...over,
});

describe("timeline orders", () => {
    it("differ only on the same-day pair", () => {
        expect(LEGACY.map((s) => s.set_name)).toEqual(["Legend of Blue Eyes White Dragon", "Gladiator's Assault", "Dark Revelation Volume 4", "Phantom Darkness"]);
        expect(TIMELINE.map((s) => s.set_name)).toEqual(["Legend of Blue Eyes White Dragon", "Dark Revelation Volume 4", "Gladiator's Assault", "Phantom Darkness"]);
    });
});

describe("reconcileSave", () => {
    it("keeps an old, nameless save on the set it meant under the old order", () => {
        // Under the old order index 1 was Gladiator's Assault; now that's index 2.
        const fixed = reconcileSave(save({ currentSetIndex: 1 }), TIMELINE, LEGACY);
        expect(fixed).toMatchObject({ currentSetIndex: 2, currentSetName: "Gladiator's Assault", setOrder: 2 });
    });

    it("leaves old saves away from the pair at the same index, just adding the name", () => {
        expect(reconcileSave(save({ currentSetIndex: 3 }), TIMELINE, LEGACY)).toMatchObject({ currentSetIndex: 3, currentSetName: "Phantom Darkness" });
    });

    it("follows the stored name when the index has drifted", () => {
        const fixed = reconcileSave(save({ currentSetIndex: 1, currentSetName: "Phantom Darkness", setOrder: 2 }), TIMELINE, LEGACY);
        expect(fixed.currentSetIndex).toBe(3);
    });

    it("returns the same object when nothing needs fixing", () => {
        const good = save({ currentSetIndex: 2, currentSetName: "Gladiator's Assault", setOrder: 2 });
        expect(reconcileSave(good, TIMELINE, LEGACY)).toBe(good);
    });

    it("treats a new save without a name yet as today's order", () => {
        expect(reconcileSave(save({ currentSetIndex: 1, setOrder: 2 }), TIMELINE, LEGACY)).toMatchObject({ currentSetIndex: 1, currentSetName: "Dark Revelation Volume 4" });
    });

    it("repairs reward anchors from the pack name they already store", () => {
        const reward = { id: "r1", prizeId: "ban" as const, wonFromPackName: "Gladiator's Assault", wonFromSetIndex: 1, wonDate: "", status: "available" as const };
        const fixed = reconcileSave(save({ currentSetIndex: 3, currentSetName: "Phantom Darkness", setOrder: 2, rewards: [reward] }), TIMELINE, LEGACY);
        expect(fixed.rewards[0]!.wonFromSetIndex).toBe(2);
    });
});

describe("reconcileSaves", () => {
    it("returns the same array when no save changed, and does nothing without set data", () => {
        const saves = [save({ currentSetIndex: 0, currentSetName: "Legend of Blue Eyes White Dragon", setOrder: 2 })];
        expect(reconcileSaves(saves, RAW)).toBe(saves);
        expect(reconcileSaves([save({ currentSetIndex: 1 })], [])).toHaveLength(1);
    });
});
