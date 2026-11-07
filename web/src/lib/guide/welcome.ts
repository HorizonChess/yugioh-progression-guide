/**
 * Yugi's welcome: the tour on a run's first timeline visit, and a line or two the first time
 * each screen opens (data/guide/welcome.json). Each is said once per device; Options can
 * replay them all. Nothing is marked as said while the guide is off, so turning him on
 * later still gets the welcome.
 */
import { useEffect } from "react";
import welcomeJson from "@/data/guide/welcome.json";
import { PRIORITY, type Line, type Mood } from "@/lib/guide/lines";
import { guide } from "@/lib/guide/store";

type Variant = "solo" | "duo" | "guest" | "member";
type WelcomeLine = { key: string; mood: Mood; target?: string; only?: Variant; text?: string } & Partial<Record<Variant, string>>;
type Script = { tour: WelcomeLine[]; screens: Record<string, WelcomeLine[]> };
const SCRIPT = welcomeJson as unknown as Script;

export type WelcomeSection = "tour" | keyof typeof welcomeJson.screens;
/** Who's being welcomed: the run's mode (solo or duo) and whether they're signed in. */
export type WelcomeContext = { mode?: "solo" | "duo"; account?: "guest" | "member"; set?: string; packs?: number; rival?: string };

const DONE_KEY = "ygo-welcome-done";

const fill = (text: string, c: WelcomeContext) =>
    text.replace(/\{(\w+)\}/g, (_, k: string) => String({ set: c.set ?? "the first set", packs: c.packs ?? 24, rival: c.rival ?? "your rival" }[k] ?? ""));

/** The section's lines for this player, in order: their wording picked, placeholders filled. */
export function welcomeLines(section: WelcomeSection, c: WelcomeContext): Line[] {
    const lines = section === "tour" ? SCRIPT.tour : SCRIPT.screens[section] ?? [];
    return lines
        .filter((l) => !l.only || l.only === c.mode || l.only === c.account)
        .map((l) => {
            const text = (c.mode && l[c.mode]) || (c.account && l[c.account]) || l.text || l.solo || "";
            return { key: `welcome:${section}:${l.key}:${c.mode === "duo" && l.duo ? "duo" : "any"}`, text: fill(text, c), mood: l.mood, priority: PRIORITY.pull, target: l.target };
        })
        .filter((l) => l.text);
}

/** Which welcomes this device has had: a section, plus ":duo" when its duo wording differs. */
function doneSet(): Set<string> {
    try {
        return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as string[]);
    } catch {
        return new Set();
    }
}
/** The section's id for "already said": duo runs get their own tour, since it says different things. */
const doneId = (section: WelcomeSection, c: WelcomeContext) => {
    const lines = section === "tour" ? SCRIPT.tour : SCRIPT.screens[section] ?? [];
    return c.mode === "duo" && lines.some((l) => l.duo) ? `${section}:duo` : section;
};

export function welcomed(section: WelcomeSection, c: WelcomeContext = {}): boolean {
    return doneSet().has(doneId(section, c));
}

/** Says the section's welcome if this device hasn't had it. Returns whether he started. */
export function welcome(section: WelcomeSection, c: WelcomeContext = {}): boolean {
    if (welcomed(section, c)) return false;
    const lines = welcomeLines(section, c);
    if (!lines.length || !guide.say(lines[0]!)) return false;
    guide.sayAll(lines.slice(1));
    try {
        const all = doneSet();
        all.add(doneId(section, c));
        localStorage.setItem(DONE_KEY, JSON.stringify([...all]));
    } catch {
        /* storage blocked: he may welcome you again */
    }
    return true;
}

/** Options: forget every welcome, so each one plays again. */
export function replayWelcome() {
    try {
        localStorage.removeItem(DONE_KEY);
    } catch {
        /* nothing to clear */
    }
    guide.forget("welcome:");
}

/**
 * A screen's welcome, once it's `ready` (loaded, and showing what the lines point at): a
 * moment after, so the page has settled and its slide-in is done.
 */
export function useWelcome(section: WelcomeSection, ready: boolean, c: WelcomeContext = {}) {
    const { mode, account, set, packs, rival } = c;
    useEffect(() => {
        if (!ready) return;
        const t = setTimeout(() => welcome(section, { mode, account, set, packs, rival }), 900);
        return () => clearTimeout(t);
    }, [ready, section, mode, account, set, packs, rival]);
}
