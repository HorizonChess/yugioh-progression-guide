import { cardTip, haulLines, pullLine, resultLine, setDetails, waitingLine, PRIORITY } from "@/lib/guide/lines";
import { guide } from "@/lib/guide/store";

// Stages: 0 = Legend of Blue Eyes, 1 = Metal Raiders, 2 = Spell Ruler, ... (data/guide/timeline.json).
const URABY = { id: 1784619, name: "Uraby" };
const FISSURE = { id: 66788016, name: "Fissure" };
const KURIBOH = { id: 40640057, name: "Kuriboh" };
const LON = 4, PGD = 6, AST = 10;

describe("Yugi's lines", () => {
    it("only talks about cards that mattered then, not every strong-looking one", () => {
        // Uraby had good ATK for its set, but tournaments didn't play it: nothing to say.
        expect(cardTip(URABY, 0)).toBeNull();
        expect(pullLine({ ...URABY, isNew: true, copies: 1 }, 0)).toBeNull();
    });

    it("judges a card by where the series is: Fissure is great early, not later", () => {
        expect(cardTip(FISSURE, 0)?.text).toMatch(/Fissure/);
        expect(cardTip(FISSURE, PGD)?.text).toMatch(/Fissure/); // its last set
        expect(cardTip(FISSURE, PGD + 1)).toBeNull();
        expect(pullLine({ ...FISSURE, isNew: true, copies: 1 }, AST)).toBeNull();
    });

    it("never forgets a card from his own duels", () => {
        expect(cardTip(KURIBOH, 1)?.text).toMatch(/Kuriboh/);
        expect(cardTip(KURIBOH, 100)?.text).toMatch(/Kuriboh/);
        expect(cardTip({ id: 0, name: "Flame Swordsman" }, 50)?.text).toMatch(/Joey/);
        expect(cardTip({ id: 0, name: "Saggi the Dark Clown" }, 50)?.text).toMatch(/Kaiba/);
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
        const lines = haulLines([{ ...FISSURE, rarity: "Rare", isNew: true, copies: 1 }, { id: 9, name: "Pot of Greed", rarity: "Rare", isNew: true, copies: 1 }, { ...URABY, rarity: "Common", isNew: true, copies: 1 }], 0, 0);
        expect(lines.map((l) => l.text)).toEqual([expect.stringMatching(/Fissure|Pot of Greed/), expect.stringMatching(/Fissure|Pot of Greed/)]);
        const quiet = haulLines([{ id: 1, name: "Some Ordinary Card", rarity: "Common", isNew: true, copies: 1 }], 0, 0);
        expect(quiet).toHaveLength(1);
        expect(quiet[0]!.mood).toBe("neutral");
    });

    it("doesn't repeat in the haul what he said as the cards flipped, nor comfort after he spoke", () => {
        const pot = { id: 9, name: "Pot of Greed", rarity: "Rare", isNew: true, copies: 1 };
        expect(pullLine(pot, 0)?.text).toMatch(/Pot of Greed/);
        expect(haulLines([pot], 0, 0, new Set([9]))).toEqual([]);
    });

    it("says nothing on a flip unless the card is new and notable", () => {
        expect(pullLine({ id: 1, name: "Some Ordinary Card", isNew: true, copies: 1 }, 0)).toBeNull();
        expect(pullLine({ ...FISSURE, isNew: true, copies: 1 }, 0)?.text).toMatch(/Fissure/);
    });

    it("on a repeat, speaks only when more copies make the deck better, and says why", () => {
        // Any monster's repeat: nothing, however good it is.
        expect(pullLine({ ...URABY, isNew: false, copies: 2 }, 0)).toBeNull();
        expect(pullLine({ ...URABY, isNew: false, copies: 3 }, 0)).toBeNull();
        // Pot of Greed: one per deck in real tournaments, but every copy counts here.
        const pot = { id: 55144522, name: "Pot of Greed", isNew: false };
        expect(pullLine({ ...pot, copies: 2 }, 0)?.text).toMatch(/Pot of Greed.*Tournaments only allowed one/);
        expect(pullLine({ ...pot, copies: 3 }, 0)?.text).toMatch(/3 Pot of Greed|third Pot of Greed/);
        // Past what a deck can use, he's quiet again; a Dark Hole wants two at most.
        expect(pullLine({ ...pot, copies: 4 }, 0)).toBeNull();
        expect(pullLine({ id: 53129443, name: "Dark Hole", isNew: false, copies: 3 }, 0)).toBeNull();
        // A Gemini Elf for the deck matters right after Labyrinth of Nightmare; much later it doesn't.
        const elf = { id: 69140098, name: "Gemini Elf", isNew: false, copies: 2 };
        expect(pullLine(elf, LON)?.text).toMatch(/Gemini Elf/);
        expect(pullLine(elf, 40)).toBeNull();
    });


    it("speaks differently in duo, naming the rival", () => {
        expect(resultLine(true, { mode: "duo", rival: "Kaiba", streak: 1 }).text).toContain("Kaiba");
        expect(resultLine(false, { mode: "solo", streak: -1, next: "Spell Ruler" }).mood).toBe("sad");
        expect(resultLine(true, { mode: "solo", streak: 1, next: "Spell Ruler", seed: 0 }).text).toContain("Spell Ruler");
        expect(waitingLine("Kaiba").text).toContain("Kaiba");
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
