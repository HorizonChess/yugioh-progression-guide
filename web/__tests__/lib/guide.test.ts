import { cardTip, haulLines, pullLine, rankLine, resultLine, setDetails, waitingLine, PRIORITY } from "@/lib/guide/lines";
import { guide } from "@/lib/guide/store";

// Stages: 0 = Legend of Blue Eyes, 1 = Metal Raiders, 2 = Spell Ruler (facts.json, built from the real pool).
const URABY = { id: 1784619, name: "Uraby" };
const SKULL_RED_BIRD = { id: 10202894, name: "Skull Red Bird" };
const COLORED_FISH = { id: 23771716, name: "7 Colored Fish" };

describe("Yugi's lines", () => {
    it("ranks a monster against the pool at the player's stage, not the whole game", () => {
        const line = rankLine(URABY, 0)!;
        expect(line).toContain("Uraby");
        expect(line).toContain("Skull Red Bird"); // the only stronger no-tribute monster in LOB
        expect(line).toContain("common");
        // By Metal Raiders, Uraby is no longer near the top.
        expect(rankLine(URABY, 1)).toBeNull();
    });

    it("never calls a monster the hardest hitter when a stronger one with a catch exists", () => {
        // In Metal Raiders, Jirai Gumo (2200, a coin toss) outhits 7 Colored Fish (1800).
        for (const s of [0, 1, 2, 3]) {
            const line = rankLine(COLORED_FISH, 1, s)!;
            expect(line).toContain("Jirai Gumo");
        }
        expect(rankLine(SKULL_RED_BIRD, 0, 0)).not.toContain("catch");
    });

    it("uses his own note for a card when he has one", () => {
        const tip = cardTip({ id: 0, name: "Pot of Greed" }, 0)!;
        expect(tip.text).toMatch(/Pot of Greed/);
        expect(tip.priority).toBe(PRIORITY.tip);
    });

    it("stays quiet on a card he has nothing to say about", () => {
        expect(cardTip({ id: 1, name: "Some Ordinary Card" }, 0)).toBeNull();
    });

    it("introduces a set you haven't opened, and talks about your cards once you have", () => {
        const cards = [{ id: 5, name: "Pot of Greed", rarity: "Rare" }, { id: 6, name: "Fissure", rarity: "Rare" }];
        const fresh = setDetails("LOB", "Legend of Blue Eyes White Dragon", cards, () => 0, 0, 0)!;
        expect(fresh.key).toBe("details:LOB:new");
        const owned = setDetails("LOB", "Legend of Blue Eyes White Dragon", cards, (id) => (id === 5 ? 1 : 0), 0, 0)!;
        expect(owned.key).toBe("details:LOB:owned");
        expect(owned.text).toMatch(/Pot of Greed|Fissure/);
    });

    it("talks about each notable pull in a haul, rarest first, else comforts", () => {
        const lines = haulLines([{ ...URABY, rarity: "Common", isNew: true, copies: 1 }, { id: 9, name: "Pot of Greed", rarity: "Rare", isNew: true, copies: 1 }], 0, 0);
        expect(lines.map((l) => l.text)).toEqual([expect.stringMatching(/Pot of Greed/), expect.stringMatching(/Uraby/)]);
        const quiet = haulLines([{ id: 1, name: "Some Ordinary Card", rarity: "Common", isNew: true, copies: 1 }], 0, 0);
        expect(quiet).toHaveLength(1);
        expect(quiet[0]!.mood).toBe("neutral");
    });

    it("doesn't repeat in the haul what he said as the cards flipped, nor comfort after he spoke", () => {
        const pot = { id: 9, name: "Pot of Greed", rarity: "Rare", isNew: true, copies: 1 };
        expect(pullLine(pot, 0)?.text).toMatch(/Pot of Greed/);
        expect(haulLines([pot], 0, 0, new Set([9]))).toEqual([]);
    });

    it("says nothing on a flip unless the card is new and notable, or a third copy", () => {
        expect(pullLine({ id: 1, name: "Some Ordinary Card", isNew: true, copies: 1 }, 0)).toBeNull();
        expect(pullLine({ ...URABY, isNew: false, copies: 2 }, 0)).toBeNull();
        expect(pullLine({ ...URABY, isNew: false, copies: 3 }, 0)?.text).toMatch(/three Uraby|third Uraby/);
    });

    it("speaks differently in duo, naming the rival", () => {
        expect(resultLine(true, { mode: "duo", rival: "Kaiba", streak: 1 }).text).toContain("Kaiba");
        expect(resultLine(false, { mode: "solo", streak: -1, next: "Spell Ruler" }).mood).toBe("sad");
        expect(resultLine(true, { mode: "solo", streak: 1, next: "Spell Ruler", seed: 0 }).text).toContain("Spell Ruler");
        expect(waitingLine("Kaiba").text).toContain("Kaiba");
    });

    it("keeps every line under 140 characters", () => {
        for (let s = 0; s < 6; s++) {
            for (const stage of [0, 1, 2]) {
                for (const card of [URABY, SKULL_RED_BIRD, COLORED_FISH]) {
                    const line = rankLine(card, stage, s);
                    if (line) expect(line.length).toBeLessThanOrEqual(140);
                }
            }
        }
    });
});

describe("the guide's one line at a time", () => {
    beforeEach(() => guide.reset());
    const line = (key: string, priority: number) => ({ key, text: key, mood: "neutral" as const, priority });

    it("lets a result cut in over a tip", () => {
        guide.say(line("tip", PRIORITY.tip));
        guide.say(line("result", PRIORITY.result));
        expect(guide.current()?.key).toBe("result");
    });

    it("spaces tips out, so browsing isn't a lecture", () => {
        expect(guide.say(line("a", PRIORITY.tip))).toBe(true);
        guide.done();
        expect(guide.say(line("b", PRIORITY.tip))).toBe(false);
    });

    it("never says the same line twice in a visit", () => {
        expect(guide.say(line("same", PRIORITY.pull))).toBe(true);
        guide.done();
        expect(guide.say(line("same", PRIORITY.pull))).toBe(false);
    });

    it("queues pulls as a conversation, and tells the tablet more is coming", () => {
        guide.sayAll([line("first", PRIORITY.pull), line("second", PRIORITY.pull), line("third", PRIORITY.pull)]);
        expect(guide.state()).toMatchObject({ line: { key: "first" }, more: 2 });
        guide.done();
        expect(guide.state()).toMatchObject({ line: { key: "second" }, more: 1 });
        guide.done();
        guide.done();
        expect(guide.current()).toBeNull();
    });

    it("never queues a tip behind a conversation", () => {
        guide.say(line("pull", PRIORITY.pull));
        expect(guide.say(line("tip", PRIORITY.tip))).toBe(false);
    });

    it("puts an interrupted conversation line back after a result", () => {
        guide.say(line("pull", PRIORITY.pull));
        guide.say(line("result", PRIORITY.result));
        guide.done();
        expect(guide.current()?.key).toBe("pull");
    });

    it("ignores a late 'done' meant for an earlier line", () => {
        guide.say(line("one", PRIORITY.pull));
        const stale = guide.current()!.at - 1;
        guide.done(stale);
        expect(guide.current()?.key).toBe("one");
    });
});
