/**
 * What Yugi says. Card lines come only from the hand-written notes in
 * data/guide/sets.json: the cards that mattered in real decks of the era (staples,
 * the beatsticks tournaments actually played), and cards he remembers from his own,
 * Kaiba's and Joey's duels. Every card a note names is checked against its set by
 * scripts/guide/build.mjs, and claims about the card pool are checked against that
 * stage's real pool. Every function is pure: it returns a line, or null when there's
 * nothing worth saying (he'd rather stay quiet than comment on every card).
 */
import notesJson from "@/data/guide/sets.json";
import timelineJson from "@/data/guide/timeline.json";

export type Mood = "neutral" | "happy" | "sad";
/** `target`: a CSS selector for what he points at while the line is up (the welcome's spotlight). */
export type Line = { key: string; text: string; mood: Mood; priority: number; target?: string };
export type GuideCard = { id: number; name: string; rarity?: string };

/** Lines on a card; with `until` (a set code) they're only said up to that set, as a card's worth depends on what's out by then. */
type CardNote = string[] | { lines: string[]; until?: string };
type Note = { intro?: string[]; cards?: Record<string, CardNote> };
/** A card worth running more than one copy of, and why (deck-building theory, not taste). */
type Multiple = { want: number; why: string; until?: string };

const NOTES = notesJson as unknown as Record<string, Note>;
const MULTIPLES = (notesJson as unknown as { _multiples: Record<string, Multiple> })._multiples;

/** Priorities: a result beats a pull, a pull beats a tip. */
export const PRIORITY = { tip: 1, details: 2, pull: 3, result: 4 } as const;

/** The timeline's set codes in order (scripts/guide/build.mjs), to place an `until`. */
const TIMELINE = timelineJson as string[];
/** The last stage a note holds at (forever without `until`). */
const lastStage = (until?: string) => (until ? TIMELINE.indexOf(until) : Infinity);

/** card name → its lines and the last stage they hold at, over every set's notes (names joined by " | " share lines). */
const CARD_LINES = new Map<string, { lines: string[]; last: number }>();
for (const [code, note] of Object.entries(NOTES)) {
    if (code.startsWith("_")) continue;
    for (const [names, entry] of Object.entries(note.cards ?? {})) {
        const { lines, until } = Array.isArray(entry) ? { lines: entry, until: undefined } : entry;
        for (const name of names.split(" | ")) CARD_LINES.set(name, { lines, last: lastStage(until) });
    }
}
/** His lines on a card, if they still hold at `stage`. */
const notesAt = (name: string, stage: number) => {
    const note = CARD_LINES.get(name);
    return note && stage <= note.last ? note.lines : null;
};

/** One of `options`, varied by `seed` so the same moment doesn't always get the same words. */
function pick<T>(options: readonly T[], seed: number): T {
    return options[Math.abs(seed) % options.length]!;
}
const fill = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/** Yugi's own words on a card: his note, if he has one that still holds at this stage. */
export function cardText(card: GuideCard, stage: number, seed = 0): string | null {
    const notes = notesAt(card.name, stage);
    return notes ? pick(notes, seed) : null;
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
    const noted = cards.filter((c) => notesAt(c.name, stage)).sort(byRarity);
    let text: string | null = null;
    if (!anyOwned) {
        if (note?.intro?.length) text = pick(note.intro, seed);
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

/** A card he'd talk about when it turns up: one he has a note on that still holds. */
const worthSaying = (c: GuideCard, stage: number): boolean => notesAt(c.name, stage) !== null;

const ORDINAL = ["", "", "second", "third"];

/** A second or third copy of a card a good deck runs more than one of (MULTIPLES), with why it matters. */
export function copyLine(card: HaulCard, stage: number, seed = 0): Line | null {
    const m = MULTIPLES[card.name];
    if (!m || card.copies < 2 || card.copies > m.want || stage > lastStage(m.until)) return null;
    const head = card.copies === m.want && m.want > 2 ? pick(["That's {n} {name}, a full set!", "Your {nth} {name}!"], seed) : pick(["A {nth} {name}!", "Another {name}!"], seed);
    const text = `${fill(head, { name: card.name, n: card.copies, nth: ORDINAL[card.copies] ?? "" })} ${m.why}`;
    return { key: `copy:${card.id}:${card.copies}`, text, mood: "happy", priority: PRIORITY.pull };
}

/**
 * A card just flipped face up: a word on it if it's new to you and worth one, or on a
 * copy that makes your deck better (copyLine). A repeat of anything else gets nothing.
 */
export function pullLine(card: HaulCard, stage: number, seed = 0): Line | null {
    if (card.isNew) return worthSaying(card, stage) ? { key: `pull:${card.id}`, text: cardText(card, stage, seed)!, mood: "happy", priority: PRIORITY.pull } : null;
    return copyLine(card, stage, seed);
}

/**
 * The haul, once it's all laid out: his words on up to three of its best cards (the
 * rarest new ones first), leaving out any he already talked about as they flipped. If
 * there's nothing to say and he said nothing while you flipped, a word of comfort.
 */
export function haulLines(cards: HaulCard[], stage: number, seed = 0, alreadySaid: ReadonlySet<number> = new Set()): Line[] {
    const lines: Line[] = [];
    const done = new Set(alreadySaid);
    const ordered = [...cards].sort((a, b) => Number(b.isNew) - Number(a.isNew) || Number(CARD_LINES.has(b.name)) - Number(CARD_LINES.has(a.name)) || byRarity(a, b));
    for (const card of ordered) {
        if (lines.length === 3) break;
        if (done.has(card.id)) continue;
        const line = pullLine(card, stage, seed + lines.length);
        if (line) {
            lines.push(line);
            done.add(card.id);
        }
    }
    if (!lines.length && !alreadySaid.size) {
        const quiet = [
            "No big pulls this time... but every card counts. Let's see what we can build!",
            "Not much luck in these packs. Don't worry, the next ones could be different!",
            "Hmm, quiet packs. Sometimes the heart of the cards makes us wait.",
        ];
        lines.push({ key: `quiet:${cards.map((c) => c.id).join(",")}`, text: pick(quiet, seed), mood: "neutral", priority: PRIORITY.pull });
    }
    return lines;
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
