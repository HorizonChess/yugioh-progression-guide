import { cardTip, haulLine, rankLine, resultLine, setDetails, waitingLine, PRIORITY } from "@/lib/guide/lines";
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

    it("comments on the best new pull in a haul, else comforts", () => {
        const pull = haulLine([{ ...URABY, rarity: "Common", isNew: true, copies: 1 }, { id: 9, name: "Pot of Greed", rarity: "Rare", isNew: true, copies: 1 }], 0, 0);
        expect(pull.text).toMatch(/Pot of Greed/);
        expect(pull.mood).toBe("happy");
        const quiet = haulLine([{ id: 1, name: "Some Ordinary Card", rarity: "Common", isNew: true, copies: 1 }], 0, 0);
        expect(quiet.mood).toBe("neutral");
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

    it("says a waiting line once the current one is done", () => {
        guide.say(line("first", PRIORITY.result));
        guide.say(line("second", PRIORITY.pull));
        guide.done();
        expect(guide.current()?.key).toBe("second");
    });

    it("ignores a late 'done' meant for an earlier line", () => {
        guide.say(line("one", PRIORITY.pull));
        const stale = guide.current()!.at - 1;
        guide.done(stale);
        expect(guide.current()?.key).toBe("one");
    });
});
