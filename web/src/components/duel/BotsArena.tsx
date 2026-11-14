"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BOT_LEVELS, DUELISTS, duelistById, duelistDeck, duelistHasEra, ruleEraFor, type BotLevel, type Duelist } from "@ygo/shared";
import { alertRepoError } from "@/context/ProgressionContext";
import type { SavedDeck } from "@/lib/storage";
import {
    carryGuestToken, concedeDuel, duelPath, getDuel, guestPracticeRecord, lastGuestDuel, openDuels, practiceRecord, startDuel, startGuestDuel,
    type BotChoice, type BotRecord, type DuelSummary, type MatchGames,
} from "@/lib/duel-client";
import { asset } from "@/lib/utils";
import { latestDeck, markDeckUsed } from "@/lib/deck-choice";
import { BotGlyph, HandGlyph } from "./DuelGlyphs";
import "./duel-launcher.css";
import "./bots-arena.css";

/**
 * The Bots Arena (route: /bots-arena): practice against the bots, in the manner of chess.com's.
 * The duelists from the anime, weakest to strongest, each with their sprite, a rating, their deck
 * in an era of the show and your record against them; the practice bot, which plays your own deck
 * at the level you pick; and solo, to try your deck against an opponent who only passes. Practice
 * counts for nothing in the series and can be played any time, as often as you like.
 */
export type Opponent = { kind: "bot"; level: BotLevel } | { kind: "duelist"; id: string; era: string } | { kind: "solo" };

const OPPONENT_KEY = "ygo-opponent";
/** Before duelists, only the bot's level was kept. */
const LEVEL_KEY = "ygo-bot-level";
/** How long a match against the bot is, as last chosen in this browser: best of 3, or a single game. */
const GAMES_KEY = "ygo-bot-games";
/**
 * The arena's look: the stone the roster's tablets and the stage are cut from, and the wall behind
 * it (public/ui/bots-arena). Sandstone is the one in use; basalt and fresco are kept for if the look
 * is ever a choice (plans/2026-11-14/bots-arena-themes). Sandstone stands on the app's own wall.
 */
const THEMES = { sandstone: { wall: false }, basalt: { wall: true }, fresco: { wall: true } } as const;
type Theme = keyof typeof THEMES;
const THEME: Theme = "sandstone";
const themeStyle = (t: Theme) => ({
    ...(THEMES[t].wall ? { "--ba-wall": `url('${asset(`/ui/bots-arena/${t}-wall.webp`)}')` } : {}),
    "--ba-tile": `url('${asset(`/ui/bots-arena/${t}-tile.webp`)}')`,
    "--ba-stage": `url('${asset(`/ui/bots-arena/${t}-stage.webp`)}')`,
}) as CSSProperties;

const LEVEL_NAMES: Record<BotLevel, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };
const GROUPS: { level: BotLevel; title: string }[] = [
    { level: "easy", title: "Beginner" },
    { level: "normal", title: "Intermediate" },
    { level: "hard", title: "Advanced" },
];
/** Where a sprite's face is across (most are centred), and down (most near the top; little Yugi's hair stands tall). */
const FACE_X: Record<string, string> = { mai: "58%" };
const FACE_Y: Record<string, string> = { yugi: "6%" };
const faceStyle = (d: Duelist) => ({ backgroundImage: `url('${sprite(d)}')`, backgroundPositionX: FACE_X[d.id] ?? "50%", ...(FACE_Y[d.id] ? { backgroundPositionY: FACE_Y[d.id] } : {}) });

const sprite = (d: Duelist) => asset(`/sprites/${d.sprite}.webp`);
const firstName = (d: Duelist) => (d.id === "pegasus" ? "Pegasus" : d.name.split(" ")[0]!);
/** Their face, as on their tablet in the roster. */
const faceOf = (o: Opponent, d: Duelist | undefined) =>
    d ? <span className="op-face" style={faceStyle(d)} /> : <span className="op-face op-face--bot">{o.kind === "solo" ? <HandGlyph /> : <BotGlyph />}</span>;
const duelistOf = (o: Opponent) => (o.kind === "duelist" ? duelistById(o.id) : undefined);
/** Who you'd be dueling, by name, for the button. */
const opponentName = (o: Opponent) => {
    const d = duelistOf(o);
    return d ? firstName(d) : "the bot";
};
/** "3–1", or "3–1–1" with draws; nothing before the first match. */
const recordText = (r?: BotRecord[string]) => (r && r.won + r.lost + r.drawn ? `${r.won}–${r.lost}${r.drawn ? `–${r.drawn}` : ""}` : "");

/** The opponent last chosen in this browser (one still on the roster), or the practice bot. */
function savedOpponent(): Opponent {
    try {
        const o = JSON.parse(localStorage.getItem(OPPONENT_KEY) ?? "null") as Opponent | null;
        if (o?.kind === "duelist" && duelistById(o.id) && duelistHasEra(duelistById(o.id)!, o.era)) return o;
        if (o?.kind === "bot" && (BOT_LEVELS as readonly string[]).includes(o.level)) return o;
        if (o?.kind === "solo") return o;
    } catch {
        // (Unreadable: start over.)
    }
    const level = localStorage.getItem(LEVEL_KEY);
    return { kind: "bot", level: level && (BOT_LEVELS as readonly string[]).includes(level) ? (level as BotLevel) : "normal" };
}

export default function BotsArena({ seriesId, guest, setName, setDate, decks }: {
    seriesId: string;
    /** Playing as a guest: the deck itself goes to the server, and the record is kept in this browser. */
    guest: boolean;
    /** The set the save is at: the cards and rules the match is played with. */
    setName: string;
    setDate?: string;
    decks: SavedDeck[];
}) {
    const router = useRouter();
    const legal = decks.filter((d) => d.mainDeck.length >= 40 && d.mainDeck.length <= 60);
    const [deckId, setDeckId] = useState("");
    // The deck saved or used last, once the decks are in.
    const offered = latestDeck(legal)?.id ?? "";
    useEffect(() => setDeckId((d) => (legal.some((x) => x.id === d) ? d : offered)), [offered]); // eslint-disable-line react-hooks/exhaustive-deps -- `legal` follows `decks`
    const [choice, setChoice] = useState<Opponent>({ kind: "bot", level: "normal" });
    useEffect(() => setChoice(savedOpponent()), []);
    const choose = (o: Opponent) => {
        setChoice(o);
        localStorage.setItem(OPPONENT_KEY, JSON.stringify(o));
    };
    const [games, setGames] = useState<MatchGames>(3);
    useEffect(() => setGames(localStorage.getItem(GAMES_KEY) === "1" ? 1 : 3), []);
    const chooseGames = (n: MatchGames) => {
        setGames(n);
        localStorage.setItem(GAMES_KEY, String(n));
    };
    // On a phone the stage is a door over the roster: shut at first, opened by picking someone.
    // Dragged (by its lintel, or anywhere on it once open) it follows the finger, as the deck
    // builder's drawer does; let go, it settles open or shut, and a quick flick carries on.
    // (On a wider screen it's always open.)
    const [door, setDoor] = useState(false);
    const doorEl = useRef<HTMLDivElement>(null);
    const drag = useRef<{ y: number; h: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null);
    const settling = useRef(0);
    const noClick = useRef(false);
    // A drag's touches are the door's, not a scroll: with no fling started, the next tap isn't eaten.
    const sideEl = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = sideEl.current;
        if (!el) return;
        const hold = (e: globalThis.TouchEvent) => { if (drag.current?.moved) e.preventDefault(); };
        el.addEventListener("touchmove", hold, { passive: false });
        return () => el.removeEventListener("touchmove", hold);
    }, []);
    const doorDrag = {
        onPointerDown: (e: ReactPointerEvent) => {
            const el = doorEl.current;
            if (!el || !window.matchMedia("(max-width: 760px)").matches || (e.pointerType === "mouse" && e.button !== 0)) return;
            drag.current = { y: e.clientY, h: el.getBoundingClientRect().height, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false };
        },
        onPointerMove: (e: ReactPointerEvent) => {
            const d = drag.current, el = doorEl.current, body = el?.firstElementChild as HTMLElement | null;
            if (!d || !el || !body) return;
            const dy = e.clientY - d.y;
            if (!d.moved) {
                if (Math.abs(dy) < 8) return;
                d.moved = true;
                settling.current++;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                el.style.transition = "none";
                el.style.display = "block";
            }
            const full = body.scrollHeight;
            const h = Math.max(0, Math.min(full * 1.04, d.h + dy));
            el.style.height = `${h}px`;
            body.style.opacity = String(Math.min(1, h / 140));
            // the finger's speed (px/ms, down is positive), smoothed over the last moves
            const dt = Math.max(1, e.timeStamp - d.lastT);
            d.v = d.v * 0.4 + ((e.clientY - d.lastY) / dt) * 0.6;
            d.lastY = e.clientY; d.lastT = e.timeStamp;
        },
        onPointerUp: (e: ReactPointerEvent) => {
            const d = drag.current, el = doorEl.current, body = el?.firstElementChild as HTMLElement | null;
            drag.current = null;
            if (!d?.moved || !el || !body) return;
            noClick.current = true;
            setTimeout(() => { noClick.current = false; }, 0);
            const full = body.scrollHeight;
            // a finger held still before letting go carries no speed
            const v = e.timeStamp - d.lastT > 120 ? 0 : d.v;
            const open = el.getBoundingClientRect().height + v * 180 > full / 2;
            const me = ++settling.current;
            el.style.transition = "height 0.3s cubic-bezier(0.2, 0.9, 0.3, 1)";
            el.style.height = `${open ? full : 0}px`;
            body.style.opacity = "";
            setDoor(open);
            const done = () => { if (settling.current === me) el.style.transition = el.style.height = el.style.display = ""; };
            el.addEventListener("transitionend", done, { once: true });
            setTimeout(done, 400);
        },
        onPointerCancel: () => {
            drag.current = null;
            const el = doorEl.current;
            if (!el) return;
            el.style.transition = el.style.height = el.style.display = "";
            (el.firstElementChild as HTMLElement | null)?.style.removeProperty("opacity");
        },
        // (a drag that ends over a button isn't a tap on it)
        onClickCapture: (e: ReactMouseEvent) => { if (noClick.current) { e.preventDefault(); e.stopPropagation(); } },
    };
    /** The practice match still going (one at a time), once looked for. */
    const [open, setOpen] = useState<DuelSummary | null | undefined>(undefined);
    const [record, setRecord] = useState<BotRecord>({});
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            if (guest) {
                const last = lastGuestDuel();
                let duel = last ? (await getDuel(last).catch(() => null))?.duel : null;
                // A match left between two games: its next game is the one that's open.
                while (duel?.status === "finished" && duel.next) {
                    carryGuestToken(duel.id, duel.next);
                    duel = (await getDuel(duel.next).catch(() => null))?.duel;
                }
                setOpen(duel?.status === "active" || duel?.status === "pregame" ? duel : null);
                setRecord(await guestPracticeRecord());
            } else {
                const [duels, mine] = await Promise.all([openDuels(seriesId), practiceRecord()]);
                setOpen(duels.find((d) => d.kind === "practice") ?? null);
                setRecord(mine);
            }
        } catch {
            setOpen(null);
        }
    }, [seriesId, guest]);
    useEffect(() => void load(), [load]);

    const run = async (task: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(true);
        try {
            await task();
        } catch (error) {
            alertRepoError(error);
        } finally {
            setBusy(false);
            void load();
        }
    };
    const start = () => run(async () => {
        const deck = legal.find((d) => d.id === deckId);
        if (!deck) return;
        markDeckUsed(deck.id);
        const against = choice.kind === "solo" ? "solo" : "bot";
        const bot: BotChoice | undefined = choice.kind === "bot" ? { level: choice.level } : choice.kind === "duelist" ? { duelist: { id: choice.id, era: choice.era } } : undefined;
        const duel = guest ? await startGuestDuel({ main: deck.mainDeck, extra: deck.extraDeck, side: deck.sideDeck ?? [] }, setName, against, bot, games) : await startDuel(seriesId, deckId, against, bot, games);
        router.push(duelPath(duel.id));
    });

    const duelist = duelistOf(choice);
    const era = duelist && choice.kind === "duelist" ? duelistDeck(duelist, choice.era) : null;
    const rules = ruleEraFor(setDate);
    const openFoe = open?.players.find((p) => p.bot);
    const mine = recordText(record[duelist?.id ?? (choice.kind === "bot" ? "bot" : "")]);

    const tile = (key: string, on: boolean, label: string, face: ReactNode, sub: string, won: string, pick: () => void) => (
        <button key={key} type="button" role="radio" aria-checked={on} aria-label={label} className={`op-tile ${on ? "is-on" : ""}`} disabled={busy} onClick={() => { pick(); setDoor(true); }}>
            {face}
            <span className="op-tile__name">{label}</span>
            <small>{sub}</small>
            {won && <em className="op-tile__record" aria-label={`Your record: ${won}`}>{won}</em>}
        </button>
    );
    const chips = (label: string, items: { id: string; text: string; on: boolean; pick: () => void }[]) => (
        <div className="op-chips" role="radiogroup" aria-label={label}>
            {items.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={c.on} className={`op-chip ${c.on ? "is-on" : ""}`} disabled={busy} onClick={c.pick}>
                    {c.text}
                </button>
            ))}
        </div>
    );

    return (
        <div className="ba-screen" data-theme={THEME} style={themeStyle(THEME)}>
            <div className="op" aria-label="Bots Arena">
                <div ref={sideEl} className={`op-side ${door ? "is-open" : ""}`} {...doorDrag}>
                    {/* A match still going comes first: one at a time. */}
                    {open && (
                        <div className="ba-open" role="status">
                            <p>
                                Your {open.match ? "match" : "duel"} against <b>{openFoe?.name ?? "the bot"}</b> is still on{open.match && open.match.games > 1 ? ` · game ${open.match.game} of ${open.match.games}` : ""}.
                            </p>
                            <div className="dl-row">
                                <button type="button" className="dl-btn dl-btn--main" onClick={() => router.push(duelPath(open.id))}>Continue</button>
                                <button type="button" className="dl-btn dl-btn--quiet" disabled={busy} onClick={() => run(() => concedeDuel(open.id, true))}>End it</button>
                            </div>
                        </div>
                    )}

                    {/* The door shut (a phone): who's chosen, on its lintel. */}
                    <button type="button" className="op-door__lintel" aria-expanded={door} aria-controls="op-door" tabIndex={door ? -1 : 0} onClick={() => setDoor(true)}>
                        {faceOf(choice, duelist)}
                        <span className="op-door__who">
                            <b>{duelist ? duelist.name : choice.kind === "solo" ? "Solo" : "Practice Bot"}</b>
                            <small>Tap someone, or pull down</small>
                        </span>
                        <i className="op-door__chev" aria-hidden="true" />
                    </button>
                    <div className="op-door" id="op-door" ref={doorEl}>
                        <div className="op-door__body">
                        <div className="op-stage">
                            <div className={`op-figure ${duelist ? "" : "op-figure--bot"}`}>{duelist ? <img key={duelist.id} src={sprite(duelist)} alt="" /> : choice.kind === "solo" ? <HandGlyph /> : <BotGlyph />}</div>
                            <div className="op-info">
                                <b className="op-name">{duelist ? duelist.name : choice.kind === "solo" ? "Solo" : "Practice Bot"}</b>
                                <span className="op-rating">
                                    {duelist ? <><i>{duelist.rating}</i> · {LEVEL_NAMES[duelist.level]}</> : choice.kind === "solo" ? "Only passes its turns" : "Plays a copy of your deck"}
                                </span>
                                {choice.kind !== "solo" && <span className="op-record">Your record: <b>{mine || "no matches yet"}</b></span>}
                                <p className="op-blurb">
                                    {duelist
                                        ? duelist.blurb
                                        : choice.kind === "solo"
                                          ? "Draw and play out your own deck, to see how it runs."
                                          : "A mirror match: learn your own deck from both sides of the table."}
                                </p>
                                {/* The era (a competitive build kept when the next era has one too), then anime or competitive. */}
                                {duelist && duelist.eras.length > 1 && chips(`${firstName(duelist)}'s deck`, duelist.eras.map((e) => ({ id: e.id, text: e.label, on: era?.era.id === e.id, pick: () => choose({ kind: "duelist", id: duelist.id, era: `${e.id}${era?.competitive && e.competitive ? "+" : ""}` }) })))}
                                {duelist && duelist.eras.length === 1 && <span className="op-era">{duelist.eras[0]!.label}</span>}
                                {duelist && era?.era.competitive && chips(`How ${firstName(duelist)}'s deck is built`, [
                                    { id: "anime", text: "As in the anime", on: !era.competitive, pick: () => choose({ kind: "duelist", id: duelist.id, era: era.era.id }) },
                                    { id: "comp", text: "Competitive", on: era.competitive, pick: () => choose({ kind: "duelist", id: duelist.id, era: `${era.era.id}+` }) },
                                ])}
                                {choice.kind === "bot" && chips("How well the bot plays", BOT_LEVELS.map((l) => ({ id: l, text: LEVEL_NAMES[l], on: choice.level === l, pick: () => choose({ kind: "bot", level: l }) })))}
                                {era && (
                                    <small className="op-credit">
                                        Deck: <a href={encodeURI(era.deck.url)} target="_blank" rel="noreferrer">{era.source.name}</a> by {era.source.author}
                                        {era.competitive && era.era.competitive && <>, as played in {era.era.competitive.played}</>}
                                    </small>
                                )}
                            </div>
                        </div>

                        {legal.length ? (
                            <label className="dl-deck">
                                <span>Your deck</span>
                                <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                                    {legal.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.mainDeck.length})</option>)}
                                </select>
                            </label>
                        ) : (
                            <p className="dl-note">Build a deck of 40 to 60 cards in the deck builder first.</p>
                        )}
                        {choice.kind !== "solo" && chips("How many games", [
                            { id: "3", text: "Best of 3", on: games === 3, pick: () => chooseGames(3) },
                            { id: "1", text: "Single game", on: games === 1, pick: () => chooseGames(1) },
                        ])}
                        <div className="dl-row">
                            <button type="button" className="dl-btn dl-btn--main" disabled={!deckId || busy || open !== null} onClick={start}>
                                {choice.kind === "solo" ? "Start a solo duel" : `Duel ${opponentName(choice)} · ${games === 1 ? "one game" : "best of 3"}`}
                            </button>
                        </div>
                        <p className="dl-note">Played by {rules.name}, with the cards of {setName}. Practice doesn&rsquo;t count for the series: play it whenever you like.</p>
                        </div>
                    </div>
                    <button type="button" className="op-door__handle" aria-label="Close the door" tabIndex={door ? 0 : -1} onClick={() => setDoor(false)} />
                </div>

                {/* Everyone, weakest first. */}
                <div className="op-list">
                    <h1 className="op-title">Bots Arena</h1>
                    <div className="op-roster" role="radiogroup" aria-label="Opponents">
                        <section className="op-group">
                            <h4>Practice</h4>
                            <div className="op-tiles">
                                {tile("bot", choice.kind === "bot", "Practice Bot", <span className="op-face op-face--bot"><BotGlyph /></span>, "Your deck", recordText(record.bot), () =>
                                    choose({ kind: "bot", level: choice.kind === "bot" ? choice.level : "normal" }),
                                )}
                                {tile("solo", choice.kind === "solo", "Solo", <span className="op-face op-face--bot"><HandGlyph /></span>, "Test your deck", "", () => choose({ kind: "solo" }))}
                            </div>
                        </section>
                        {GROUPS.map((g) => (
                            <section key={g.level} className="op-group">
                                <h4>{g.title}</h4>
                                <div className="op-tiles">
                                    {DUELISTS.filter((d) => d.level === g.level).map((d) =>
                                        tile(
                                            d.id,
                                            duelist?.id === d.id,
                                            d.name,
                                            <span className="op-face" style={faceStyle(d)} />,
                                            String(d.rating),
                                            recordText(record[d.id]),
                                            () => choose({ kind: "duelist", id: d.id, era: duelist?.id === d.id && era ? era.id : d.eras[0]!.id }),
                                        ),
                                    )}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
