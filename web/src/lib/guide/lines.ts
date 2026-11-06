/**
 * What Yugi says, picked from what's true at this point in the series. The card facts
 * come from data/guide/facts.json (built from the real card pool by
 * scripts/guide/build.mjs) and the hand-written notes from data/guide/sets.json, so
 * nothing here is from memory. Every function is pure: it returns a line, or null when
 * there's nothing worth saying (he'd rather stay quiet than state the obvious).
 */
import factsJson from "@/data/guide/facts.json";
import notesJson from "@/data/guide/sets.json";

export type Mood = "neutral" | "happy" | "sad";
export type Line = { key: string; text: string; mood: Mood; priority: number };
export type GuideCard = { id: number; name: string; rarity?: string };

type Ranked = { id: number; name: string; atk: number; common: boolean };
type Tier = { top: Ranked[]; catch?: Ranked };
type Facts = { stage: number; name: string; tiers: Tier[] };
type Note = { intro?: string[]; cards?: Record<string, string[]> };

const FACTS = factsJson as unknown as Record<string, Facts>;
const NOTES = notesJson as unknown as Record<string, Note>;

/** Priorities: a result beats a pull, a pull beats a tip. */
export const PRIORITY = { tip: 1, details: 2, pull: 3, result: 4 } as const;

/** The pool facts for a stage (by its place on the timeline). */
export function factsAt(stage: number): Facts | undefined {
    return Object.values(FACTS).find((f) => f.stage === stage);
}

/** card name → its lines, over every set's notes (names joined by " | " share lines). */
const CARD_LINES = new Map<string, string[]>();
for (const [code, note] of Object.entries(NOTES)) {
    if (code.startsWith("_")) continue;
    for (const [names, lines] of Object.entries(note.cards ?? {})) for (const name of names.split(" | ")) CARD_LINES.set(name, lines);
}

/** One of `options`, varied by `seed` so the same moment doesn't always get the same words. */
function pick<T>(options: readonly T[], seed: number): T {
    return options[Math.abs(seed) % options.length]!;
}
const fill = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

const COMMON = " It's a common, so expect it across the table too.";
const COST = ["no tribute", "a single tribute", "two tributes"];

/**
 * A line worked out from the pool: where this monster ranks among the ones both of
 * you can have right now, by tributes. Only the top three of each get a line.
 */
export function rankLine(card: GuideCard, stage: number, seed = 0): string | null {
    const facts = factsAt(stage);
    if (!facts) return null;
    for (const [t, tier] of facts.tiers.entries()) {
        const at = tier.top.findIndex((m) => m.id === card.id);
        if (at === -1 || at > 2) continue;
        const me = tier.top[at]!;
        const vars = { name: me.name, atk: me.atk, top: tier.top[0]!.name, catch: tier.catch?.name ?? "", cost: COST[t]! };
        let options: string[];
        if (at === 0 && tier.catch) {
            options = ["{name}! {atk} ATK for {cost}. Only {catch} hits harder, and it comes with a catch!", "{name}! Nothing hits harder for {cost}, unless you count {catch}... and that one bites back."];
        } else if (at === 0 && t === 2) {
            options = ["{name}! The strongest monster in the packs so far. Two tributes, but it's worth it!", "{name}! Nothing in the packs so far can match it. Protect it and it'll win you duels!"];
        } else if (at === 0) {
            options = ["{name}! {atk} ATK for {cost}. Nothing in the packs so far hits harder!", "{name}! Nothing hits harder than this for {cost} right now. Put it in your deck!"];
        } else if (at === 1) {
            options = ["{name} hits for {atk} with {cost}. Only {top} is stronger so far!", "{name}! {atk} ATK for {cost}. Just {top} beats that right now."];
        } else {
            options = ["{name}: {atk} ATK for {cost}. That's one of the strongest you can find right now!"];
        }
        let text = fill(pick(options, seed), vars);
        if (me.common && t === 0 && text.length + COMMON.length <= 140) text += COMMON;
        return text;
    }
    return null;
}

/** Yugi's own words on a card: his note if he has one, else where it ranks. */
export function cardText(card: GuideCard, stage: number, seed = 0): string | null {
    const notes = CARD_LINES.get(card.name);
    return notes ? pick(notes, seed) : rankLine(card, stage, seed);
}

/** Looking at a card in a list or close-up. */
export function cardTip(card: GuideCard, stage: number, seed = 0): Line | null {
    const text = cardText(card, stage, seed);
    return text ? { key: `card:${card.id}`, text, mood: "neutral", priority: PRIORITY.tip } : null;
}

const RARITY_RANK = ["Ghost Rare", "Ultimate Rare", "Secret Rare", "Ultra Rare", "Super Rare", "Rare", "Short Print", "Common"];
const rarityRank = (c: GuideCard) => {
    const i = RARITY_RANK.indexOf(c.rarity ?? "Common");
    return i === -1 ? RARITY_RANK.length : i;
};
const byRarity = (a: GuideCard, b: GuideCard) => rarityRank(a) - rarityRank(b);

/**
 * Opening a set's card list. Before you own any of it: what the set brings. After: a
 * card from it you already have, or one you're still missing.
 */
export function setDetails(setCode: string, setName: string, cards: GuideCard[], owned: (id: number) => number, stage: number, seed = 0): Line | null {
    const note = NOTES[setCode];
    const anyOwned = cards.some((c) => owned(c.id) > 0);
    const noted = cards.filter((c) => CARD_LINES.has(c.name)).sort(byRarity);
    let text: string | null = null;
    if (!anyOwned) {
        if (note?.intro?.length) text = pick(note.intro, seed);
        else {
            const best = cards.map((c) => rankLine(c, stage, seed)).find((l) => l !== null);
            text = best ?? null;
        }
    } else {
        const have = noted.filter((c) => owned(c.id) > 0);
        const missing = noted.filter((c) => owned(c.id) === 0);
        if (have.length && (seed % 2 === 0 || !missing.length)) text = cardText(pick(have.slice(0, 3), seed), stage, seed);
        else if (missing.length) {
            const lines = ["No {name} yet... it's in here somewhere. Keep opening!", "Still looking for {name}? The heart of the cards will bring it!"];
            text = fill(pick(lines, seed), { name: pick(missing.slice(0, 3), seed).name });
        }
    }
    if (!text || text.length > 140) return null;
    return { key: `details:${setCode}:${anyOwned ? "owned" : "new"}`, text, mood: "neutral", priority: PRIORITY.details };
}

export type HaulCard = GuideCard & { isNew: boolean; copies: number };

/** The haul at the end of opening: the best thing in it, or a word of comfort. */
export function haulLine(cards: HaulCard[], stage: number, seed = 0): Line {
    const fresh = cards.filter((c) => c.isNew).sort(byRarity);
    const worthSaying = (c: GuideCard) => CARD_LINES.has(c.name) || rankLine(c, stage) !== null;
    const star = fresh.find((c) => CARD_LINES.has(c.name)) ?? fresh.find(worthSaying);
    const key = `haul:${cards.map((c) => c.id).join(",")}`;
    if (star) return { key, text: cardText(star, stage, seed)!, mood: "happy", priority: PRIORITY.pull };
    const third = cards.find((c) => c.copies === 3 && worthSaying(c));
    if (third) {
        const lines = ["That's three {name}! A full set for your deck.", "Your third {name}! You can run all three now."];
        return { key, text: fill(pick(lines, seed), { name: third.name }), mood: "happy", priority: PRIORITY.pull };
    }
    const quiet = [
        "No big pulls this time... but every card counts. Let's see what we can build!",
        "Not much luck in these packs. Don't worry, the next ones could be different!",
        "Hmm, quiet packs. Sometimes the heart of the cards makes us wait.",
    ];
    return { key, text: pick(quiet, seed), mood: "neutral", priority: PRIORITY.pull };
}

/** After recording a duel. In solo the opponent is the set; in duo it's the rival. `streak` counts this result: +3 is a third win in a row. */
export function resultLine(won: boolean, o: { mode: "solo" | "duo"; rival?: string; streak: number; next?: string; seed?: number }): Line {
    const seed = o.seed ?? 0;
    const vars = { rival: o.rival ?? "your rival", next: o.next ?? "the next set", n: Math.abs(o.streak) };
    const duo = o.mode === "duo";
    let lines: string[];
    if (won) {
        lines = duo
            ? o.streak >= 3
                ? ["{n} wins in a row against {rival}! Once they confirm, the wheel is yours."]
                : ["You beat {rival}! Once they confirm it, the wheel is yours to spin.", "That's one for us! Now {rival} has to confirm it... no backing out!"]
            : o.streak >= 3
              ? ["{n} wins in a row! The heart of the cards is really with you. On to {next}!"]
              : ["We did it! {next} is open now. Let's see what it brings!", "That's the game! Spin the wheel, then on to {next}!"];
    } else {
        lines = duo
            ? o.streak <= -2
                ? ["{rival} got us again... Let's look at your deck together before the rematch."]
                : ["{rival} took this one. We'll get them back! Your pity packs are waiting.", "Good duel, even if {rival} won. Let's open those pity packs!"]
            : o.streak <= -2
              ? ["{n} losses in a row... let's look at your deck together before {next}."]
              : ["We'll get them next time. Three pity packs are waiting for you.", "Don't give up! Every loss teaches us something. Your pity packs are ready."];
    }
    return { key: `result:${won}:${seed}`, text: fill(pick(lines, seed), vars), mood: won ? "happy" : "sad", priority: PRIORITY.result };
}

/** A duo result reported, waiting on the rival. */
export function waitingLine(rival: string, seed = 0): Line {
    const lines = ["Now we wait for {rival} to confirm. No peeking at their face!", "Sent! {rival} just has to confirm it."];
    return { key: `waiting:${seed}`, text: fill(pick(lines, seed), { rival }), mood: "neutral", priority: PRIORITY.result };
}
