"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { zoneKey, type ActionVerb, type DuelCardView, type DuelEvent, type DuelPrompt, type DuelView, type Phase, type PlaceZone, type PromptCard, type Side, type Zone } from "@ygo/shared";
import { CardCloseUp, CardPlate } from "@/components/card/CardPlate";
import { printedIn, type StageCard } from "@/components/packs/stage/plate";
import { fetchCardsByIds, type Card } from "@/lib/api";
import { useIsPhone } from "@/lib/useIsPhone";
import { DesktopBoard, PhoneBoard } from "./Boards";
import { cardImage, type CardMarks, type Pose } from "./parts";
import { setDuelPrefs, useDuelPrefs } from "./duel-prefs";
import { sfx } from "./sfx";
import { useDuel } from "./useDuel";
import "./duel-field.css";

const PHASES: Phase[] = ["DP", "SP", "M1", "BP", "M2", "EP"];
const PHASE_NAME: Record<Phase, string> = { DP: "Draw", SP: "Standby", M1: "Main 1", BP: "Battle", M2: "Main 2", EP: "End" };
const VERB: Record<ActionVerb, string> = {
    summon: "Normal Summon", special: "Special Summon", set: "Set", "set-spell": "Set", reposition: "Change battle position",
    activate: "Activate", attack: "Attack", "attack-direct": "Attack",
};
const ON_BOARD: Zone[] = ["hand", "monster", "spell", "field", "pendulum"];

/** Card data (names, text) for the codes on screen, fetched as new ones appear. */
function useCards(codes: number[]) {
    const [cards, setCards] = useState<Map<number, Card>>(new Map());
    const asked = useRef(new Set<number>());
    const key = [...new Set(codes.filter((c) => c > 0))].sort((a, b) => a - b).join(",");
    useEffect(() => {
        const ids = key ? key.split(",").map(Number).filter((id) => !asked.current.has(id)) : [];
        if (!ids.length) return;
        ids.forEach((id) => asked.current.add(id));
        fetchCardsByIds(ids).then((list) => setCards((m) => new Map([...m, ...list.map((c) => [c.id, c] as const)])));
    }, [key]);
    return cards;
}

const codesOf = (view: DuelView | null, prompt: DuelPrompt | null) => {
    if (!view) return [];
    const all = (["me", "opp"] as const).flatMap((s) => {
        const v = view[s];
        return [...v.hand, ...v.monsters, ...v.spells, v.field, ...v.pendulum, ...v.grave, ...v.banished];
    });
    const fromPrompt = prompt && "cards" in prompt ? prompt.cards.map((c) => c.code) : prompt?.kind === "chain" ? prompt.options.map((o) => o.code) : [];
    return [...all.flatMap((c) => (c?.code ? [c.code] : [])), ...view.chain.map((c) => c.code), ...fromPrompt];
};

/** Every card on the view by uid, to name the cards an event is about. */
const byUid = (view: DuelView) => {
    const map = new Map<string, DuelCardView>();
    for (const s of ["me", "opp"] as const) {
        const v = view[s];
        for (const c of [...v.hand, ...v.monsters, ...v.spells, v.field, ...v.pendulum, ...v.grave, ...v.banished]) if (c) map.set(c.uid, c);
    }
    return map;
};

type Action = Extract<DuelPrompt, { kind: "actions" }>["actions"][number];
/** Verbs that put a card from the hand onto the field. */
const PLACES: ReadonlySet<ActionVerb> = new Set(["summon", "special", "set", "set-spell", "activate"]);

export default function DuelScreen({ duelId, onLeave }: { duelId: string; onLeave: (result: "win" | "loss" | "draw" | null) => void }) {
    const isPhone = useIsPhone();
    const [log, setLog] = useState<{ key: number; text: string; side?: Side }[]>([]);
    const namesRef = useRef<(code: number) => string>(() => "a card");
    const onEvent = useCallback((e: DuelEvent, view: DuelView) => {
        const text = describe(e, view, namesRef.current);
        if (text) setLog((l) => [...l.slice(-199), { key: Math.random(), text, side: "side" in e ? (e.side ?? undefined) : undefined }]);
    }, []);
    const duel = useDuel(duelId, onEvent);
    const { state, view, prompt, effects } = duel;
    const cards = useCards(codesOf(view, prompt));
    const name = useCallback((code: number) => (code ? (cards.get(code)?.name ?? "a card") : "a Set card"), [cards]);
    useEffect(() => {
        namesRef.current = name;
    }, [name]);

    // What the player is looking at: the close-up (phones) or the detail panel (wide screens).
    const [closeUp, setCloseUp] = useState<StageCard | null>(null);
    const [detail, setDetail] = useState<number | null>(null);
    const look = (code: number) => {
        const c = cards.get(code);
        if (!c) return;
        if (isPhone) setCloseUp(printedIn(c, "", 0, "In this duel"));
        else setDetail(code);
    };

    /** The card you've picked up: it rises, its actions are offered, and where it could go shows. */
    const [held, setHeld] = useState<{ card: DuelCardView; side: Side; zone: Zone } | null>(null);
    /** What you last chose to do with a card: a Set monster goes in sideways, so its zone's sideways frame lights. */
    const [placing, setPlacing] = useState<ActionVerb | null>(null);
    const [browse, setBrowse] = useState<{ title: string; cards: DuelCardView[] } | null>(null);
    const [picked, setPicked] = useState<number[]>([]);
    const [nameGuess, setNameGuess] = useState("");
    /** The duel menu (⋯): closed, open, or asking to confirm a surrender. */
    const [duelMenu, setDuelMenu] = useState<"closed" | "open" | "surrender">("closed");
    const prefs = useDuelPrefs();
    // A new question starts with nothing chosen. (A card you picked up stays up, inert, until the
    // next question takes its place, and through choosing its zone or its Tributes.)
    const promptKey = state ? `${state.seq}:${prompt?.kind ?? ""}` : "";
    const keepHeld = prompt?.kind === "place" || (prompt?.kind === "cards" && !!prompt.tribute);
    useEffect(() => {
        /* eslint-disable react-hooks/set-state-in-effect -- reset per question */
        setPicked([]);
        if (!keepHeld) setHeld(null);
        /* eslint-enable react-hooks/set-state-in-effect */
    }, [promptKey, keepHeld]);

    const answer = duel.answer;

    // A question for you gets a soft chime (the steady "your move" hint doesn't).
    const asking = prompt && prompt.kind !== "actions" ? promptKey : "";
    useEffect(() => {
        if (asking) sfx.ask();
    }, [asking]);

    // "Thinking…" only once the rival really takes a moment: a quick reply never flashes it.
    const waiting = !!state && !prompt && !duel.playing && !state.result;
    const [slow, setSlow] = useState(false);
    useEffect(() => {
        if (!waiting) return;
        const t = setTimeout(() => setSlow(true), 700);
        return () => {
            clearTimeout(t);
            setSlow(false);
        };
    }, [waiting]);

    // ---- which cards glow, and what a tap on one does ------------------------------------

    const boardPick = prompt?.kind === "cards" && prompt.cards.every((c) => c.uid && ON_BOARD.includes(c.where));
    const pickById = useMemo(() => new Map(prompt?.kind === "cards" ? prompt.cards.map((c) => [c.uid ?? `#${c.id}`, c]) : []), [prompt]);
    const marks: CardMarks = useMemo(() => {
        const glow = new Set<string>();
        const chosen = new Set<string>();
        if (prompt?.kind === "actions") prompt.actions.forEach((a) => a.uid && glow.add(a.uid));
        if (prompt?.kind === "chain") prompt.options.forEach((o) => o.uid && glow.add(o.uid));
        if (prompt?.kind === "cards" && boardPick) {
            prompt.cards.forEach((c) => c.uid && glow.add(c.uid));
            prompt.cards.filter((c) => picked.includes(c.id)).forEach((c) => chosen.add(c.uid!));
            prompt.step?.chosen.forEach((c) => c.uid && chosen.add(c.uid));
        }
        // Zones a placement question offers. The Extra Monster Zones are one shared row, keyed as you see it.
        // A monster being Set goes in face-down Defense Position: its zone's sideways frame lights.
        const keyOf = (z: PlaceZone) => zoneKey(z.zone === "extra-monster" ? "me" : z.side, z.zone, z.index);
        const poseOf = (z: PlaceZone): Pose => ((z.zone === "monster" || z.zone === "extra-monster") && placing === "set" ? "side" : "up");
        const zones = new Map<string, Pose>(), chosenZones = new Set<string>();
        if (prompt?.kind === "place") {
            prompt.zones.forEach((z) => zones.set(keyOf(z), poseOf(z)));
            prompt.zones.filter((z) => picked.includes(z.id)).forEach((z) => chosenZones.add(keyOf(z)));
        }
        // A card held up from the hand: the free zones it could go to show, before anything is chosen.
        const preview = new Map<string, Pose>();
        if (held && held.zone === "hand" && view && prompt?.kind === "actions") {
            const data = cards.get(held.card.code);
            const monster = !!data?.type.includes("Monster");
            const verbs = new Set(prompt.actions.filter((a) => a.uid === held.card.uid).map((a) => a.verb));
            const free = (row: (DuelCardView | null)[], zone: "monster" | "spell") => row.flatMap((c, i) => (c ? [] : [zoneKey("me", zone, i)]));
            if (monster && (verbs.has("summon") || verbs.has("special"))) free(view.me.monsters, "monster").forEach((k) => preview.set(k, "up"));
            else if (monster && verbs.has("set")) free(view.me.monsters, "monster").forEach((k) => preview.set(k, "side"));
            if (!monster && (verbs.has("set-spell") || verbs.has("activate"))) {
                if (data?.race === "Field") {
                    if (!view.me.field) preview.set(zoneKey("me", "field", 0), "up");
                } else free(view.me.spells, "spell").forEach((k) => preview.set(k, "up"));
            }
        }
        const onZone = (key: string) => {
            if (prompt?.kind !== "place") return;
            const z = prompt.zones.find((x) => keyOf(x) === key);
            if (!z) return;
            if (prompt.count === 1) return answer({ kind: "choice", id: z.id });
            setPicked((p) => (p.includes(z.id) ? p.filter((x) => x !== z.id) : p.length < prompt.count ? [...p, z.id] : p));
        };
        return {
            glow, picked: chosen, destroying: effects.destroying, landing: effects.landing, flaring: effects.flaring, hit: effects.hit, floats: effects.floats,
            zones, chosenZones, onZone, preview, raised: held?.card.uid ?? null,
        };
    }, [prompt, boardPick, picked, effects, answer, placing, held, view, cards]);

    /** An action's name, as the game calls it: a Level 5 or higher monster is Tribute Summoned (or Set). */
    const actionLabel = (a: Action) => {
        const level = cards.get(a.code)?.level ?? 0;
        if (a.verb === "summon") return level >= 5 ? "Tribute Summon" : "Normal Summon";
        if (a.verb === "set") return level >= 5 ? "Tribute Set" : "Set";
        if (a.verb === "attack-direct") return "Attack directly";
        return VERB[a.verb];
    };
    const choose = (a: Action) => {
        setPlacing(PLACES.has(a.verb) ? a.verb : null);
        answer({ kind: "choice", id: a.id });
    };

    const togglePick = (id: number, max: number, min: number) => {
        if (prompt?.kind !== "cards") return;
        if (prompt.step) return answer({ kind: "choice", id });
        if (max === 1 && min === 1) return answer({ kind: "many", ids: [id] });
        setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < max ? [...p, id] : p));
    };

    const onCard = (card: DuelCardView, side: Side, zone: Zone) => {
        if (prompt?.kind === "cards" && boardPick) {
            const c = pickById.get(card.uid);
            if (c) return togglePick(c.id, prompt.max, prompt.min);
            const back = prompt.step?.chosen.find((x) => x.uid === card.uid);
            if (back) return answer({ kind: "choice", id: back.id });
        }
        if (prompt?.kind === "chain") {
            const options = prompt.options.filter((o) => o.uid === card.uid);
            if (options.length === 1) return answer({ kind: "choice", id: options[0]!.id });
        }
        if (prompt?.kind === "actions" && prompt.actions.some((a) => a.uid === card.uid)) {
            // Pick the card up (or put it back down with a second tap). On wide screens it also shows in the detail panel.
            if (held?.card.uid === card.uid) return setHeld(null);
            setHeld({ card, side, zone });
            if (!isPhone && card.code) setDetail(card.code);
            return;
        }
        setHeld(null);
        if (card.code && (card.faceUp || side === "me")) look(card.code);
    };

    const onPile = (side: Side, zone: "grave" | "banished") => {
        if (!view) return;
        const list = view[side][zone];
        setBrowse({ title: `${side === "me" ? "Your" : `${view.opp.name}'s`} ${zone === "grave" ? "Graveyard" : "banished cards"}`, cards: [...list].reverse() });
    };

    if (!state || !view) {
        return <div className="df-arena"><div className="df-loading">Shuffling the decks…</div></div>;
    }

    // ---- the phase bar --------------------------------------------------------------------

    const nextIds = new Map(prompt?.kind === "actions" ? prompt.next.map((n) => [n.to as Phase, n.id]) : []);
    const phaseBar = (
        <div className="df-phases">
            <span className="df-turn">
                <b>Turn {view.turn}</b>
                <span>{view.turnPlayer === "me" ? "Your turn" : `${view.opp.name}'s turn`}</span>
            </span>
            <div className="df-phases__pills" role="tablist" aria-label="Phases">
                {PHASES.map((p) => {
                    const id = nextIds.get(p);
                    return (
                        <button key={p} type="button" role="tab" aria-selected={view.phase === p} aria-label={PHASE_NAME[p]} disabled={id === undefined}
                            className={`df-phase ${view.phase === p ? "is-on" : ""} ${id !== undefined ? "is-next" : ""}`}
                            onClick={() => id !== undefined && answer({ kind: "choice", id })}>
                            {p}
                        </button>
                    );
                })}
            </div>
            <button type="button" className="df-menu-btn" onClick={() => setDuelMenu("open")} aria-label="Duel menu">⋯</button>
        </div>
    );

    // ---- the question, as a sheet (phones) or a panel (wide screens) ---------------------

    const sheet = (title: string, body: ReactNode, opts: { text?: string; code?: number; compact?: boolean } = {}) => (
        <motion.div key="sheet" className={`df-sheet ${opts.compact ? "df-sheet--compact" : ""}`}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 36 }}>
            <div className="df-sheet__grip" />
            <div className="df-sheet__head">
                {opts.code ? <img className="df-sheet__thumb" src={cardImage(opts.code)} alt="" onClick={() => look(opts.code!)} /> : null}
                <div>
                    <h2 className="df-sheet__title">{title}</h2>
                    {opts.text && <p className="df-sheet__text">{opts.text}</p>}
                </div>
            </div>
            {body}
        </motion.div>
    );
    const option = (label: string, run: () => void, extra: { note?: string; disabled?: boolean; quiet?: boolean } = {}) => (
        <button key={label + (extra.note ?? "")} type="button" className={`df-opt ${extra.quiet ? "df-opt--quiet" : ""}`} disabled={extra.disabled} onClick={run}>
            <span>{label}</span>{extra.note && <small>{extra.note}</small>}
        </button>
    );
    const listPick = (list: PromptCard[], selected: number[], onTap: (id: number) => void) => (
        <div className="df-sheet__list">
            {list.map((c) => (
                <button key={c.id} type="button" className={`df-listcard ${selected.includes(c.id) ? "is-picked" : ""}`} onClick={() => onTap(c.id)}>
                    <img src={c.code ? cardImage(c.code) : cardImage(0)} alt="" />
                    <span>{c.code ? name(c.code) : "Face-down card"}</span>
                    <small>{c.side === "opp" ? `${view.opp.name}'s ` : ""}{c.where === "grave" ? "Graveyard" : c.where === "banished" ? "banished" : c.where === "deck" ? "Deck" : c.where === "extra" ? "Extra Deck" : c.where}</small>
                </button>
            ))}
        </div>
    );

    let question: ReactNode = null;
    // The card you've picked up: what you can do with it, in the bar above your hand.
    const heldActions = held && prompt?.kind === "actions" ? prompt.actions.filter((a) => a.uid === held.card.uid) : [];
    if (held && (heldActions.length || duel.answered) && !browse && duelMenu === "closed") {
        question = (
            <motion.div key="hint" className="df-hint df-actions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
                <span className="df-actions__name">{held.card.code ? name(held.card.code) : "Set card"}</span>
                {heldActions.map((a) => (
                    <button key={a.id} type="button" className="df-hint__btn df-act" onClick={() => choose(a)}>
                        {actionLabel(a)}
                        {a.verb === "activate" && a.text && heldActions.filter((x) => x.verb === "activate").length > 1 && <small>{a.text}</small>}
                    </button>
                ))}
                {isPhone && held.card.code > 0 && <button type="button" className="df-hint__btn df-act df-act--quiet" onClick={() => look(held.card.code)}>Details</button>}
                <button type="button" className="df-act df-act--close" aria-label="Put the card back" onClick={() => setHeld(null)}>✕</button>
            </motion.div>
        );
    } else if (browse) {
        question = sheet(browse.title, <><div className="df-sheet__list">{browse.cards.map((c) => (
            <button key={c.uid} type="button" className="df-listcard" onClick={() => look(c.code)}><img src={cardImage(c.code)} alt="" /><span>{name(c.code)}</span></button>
        ))}</div>{option("Close", () => setBrowse(null), { quiet: true })}</>);
    } else if (duelMenu === "surrender") {
        question = sheet("Surrender this duel?", <div className="df-sheet__options">{option("Surrender", () => (setDuelMenu("closed"), duel.concede()))}{option("Keep dueling", () => setDuelMenu("closed"), { quiet: true })}</div>, { text: state.rival.bot ? "It's only practice." : `${state.rival.name} wins the duel, and the result counts for the series.` });
    } else if (duelMenu === "open") {
        question = sheet("Duel menu", <div className="df-sheet__options">
            {option(prefs.sound ? "Sound: on" : "Sound: off", () => setDuelPrefs({ sound: !prefs.sound }), { note: "The duel's sound effects" })}
            {option(prefs.chain === "auto" ? "Ask me to respond: when it matters" : "Ask me to respond: at every chance", () => setDuelPrefs({ chain: prefs.chain === "auto" ? "always" : "auto" }), {
                note: prefs.chain === "auto" ? "Only when your rival plays something, or a card of yours is made for the moment" : "Stops at every point where a card of yours could be activated",
            })}
            {option("Surrender", () => setDuelMenu("surrender"))}
            {option("Back to the duel", () => setDuelMenu("closed"), { quiet: true })}
        </div>, { text: "Dueling in the app is experimental: if something looks wrong, tell us what happened." });
    } else if (prompt) {
        switch (prompt.kind) {
            case "actions":
                question = (
                    <motion.div key="hint" className="df-hint" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                        {prompt.actions.length ? "Tap a glowing card to use it" : "Nothing to do here"}
                        {prompt.next.map((n) => <button key={n.id} type="button" className="df-hint__btn" onClick={() => answer({ kind: "choice", id: n.id })}>{n.to === "BP" ? "Battle" : n.to === "M2" ? "Main 2" : "End turn"}</button>)}
                    </motion.div>
                );
                break;
            case "chain": {
                const last = view.chain[view.chain.length - 1];
                // Two copies of a card offer the same thing: one button each.
                const seen = new Set<string>();
                const distinct = prompt.options.filter((o) => {
                    const k = `${o.code}:${o.text ?? ""}:${o.where}`;
                    return seen.has(k) ? false : (seen.add(k), true);
                });
                question = sheet(prompt.forced ? "Activate an effect" : last ? `Respond to ${name(last.code)}?` : "Activate a card?", (
                    <div className="df-sheet__options">
                        {distinct.map((o) => option(name(o.code), () => answer({ kind: "choice", id: o.id }), { note: o.text }))}
                        {prompt.pass !== null && option(last ? "Don't respond" : "Pass", () => answer({ kind: "choice", id: prompt.pass! }), { quiet: true })}
                    </div>
                ), { text: last ? `${last.side === "me" ? "You" : view.opp.name} activated it as chain link ${view.chain.length}.` : undefined, code: last?.code });
                break;
            }
            case "cards": {
                const ready = picked.length >= prompt.min && picked.length <= prompt.max;
                const confirm = !prompt.step && !(prompt.max === 1 && prompt.min === 1) && option(`Confirm (${picked.length}/${prompt.max})`, () => answer({ kind: "many", ids: picked }), { disabled: !ready });
                const finish = prompt.step?.canFinish && option("Done", () => answer({ kind: "done" }));
                const cancel = prompt.cancel && option("Cancel", () => answer({ kind: "cancel" }), { quiet: true });
                question = boardPick
                    ? sheet(prompt.title, <div className="df-sheet__bar"><span>Tap the glowing cards{prompt.sum ? ` (total ${prompt.sum})` : ""}</span>{confirm}{finish}{cancel}</div>, { compact: true })
                    : sheet(prompt.title, <>{listPick(prompt.cards, prompt.step ? prompt.step.chosen.map((c) => c.id) : picked, (id) => togglePick(id, prompt.max, prompt.min))}<div className="df-sheet__options df-sheet__options--row">{confirm}{finish}{cancel}</div></>);
                break;
            }
            case "yesno":
                question = sheet(prompt.title, <div className="df-sheet__options df-sheet__options--row">{option("Yes", () => answer({ kind: "choice", id: 1 }))}{option("No", () => answer({ kind: "choice", id: 0 }), { quiet: true })}</div>, { code: prompt.code });
                break;
            case "option":
            case "number":
                question = sheet(prompt.title, <div className="df-sheet__options">{prompt.options.map((o) => option("text" in o ? o.text : o.label, () => answer({ kind: "choice", id: o.id })))}</div>);
                break;
            case "position":
                question = sheet(`${name(prompt.code)}: which position?`, <div className="df-sheet__options">{prompt.options.map((o) => option(o.label, () => answer({ kind: "choice", id: o.id })))}</div>, { code: prompt.code });
                break;
            case "declare":
                question = sheet(prompt.title, <>
                    <div className="df-sheet__chips">{prompt.options.map((o) => (
                        <button key={o.id} type="button" className={`df-chip ${picked.includes(o.id) ? "is-on" : ""}`} onClick={() => setPicked((p) => (p.includes(o.id) ? p.filter((x) => x !== o.id) : p.length < prompt.count ? [...p, o.id] : p))}>{o.label}</button>
                    ))}</div>
                    <div className="df-sheet__options">{option("Declare", () => answer({ kind: "many", ids: picked }), { disabled: picked.length !== prompt.count })}</div>
                </>);
                break;
            case "place":
                // No question to read: the zones glow, and a tap on one puts the card there.
                question = prompt.count === 1 && !prompt.disable ? (
                    <motion.div key="hint" className="df-hint" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
                        Tap a glowing zone
                    </motion.div>
                ) : sheet(prompt.title, (
                    <div className="df-sheet__bar">
                        <span>Tap the glowing zones</span>
                        {prompt.count > 1 && option(`Confirm (${picked.length}/${prompt.count})`, () => answer({ kind: "many", ids: picked }), { disabled: picked.length !== prompt.count })}
                    </div>
                ), { compact: true });
                break;
            case "card-name":
                question = sheet(prompt.title, <form className="df-sheet__form" onSubmit={(e) => (e.preventDefault(), answer({ kind: "name", name: nameGuess }))}>
                    <input className="df-input" value={nameGuess} onChange={(e) => setNameGuess(e.target.value)} placeholder="Exact card name, e.g. Dark Magician" autoFocus />
                    {option("Declare", () => answer({ kind: "name", name: nameGuess }), { disabled: !nameGuess.trim() })}
                </form>);
                break;
        }
    } else if (waiting && slow) {
        question = (
            <motion.div key="wait" className="df-hint df-hint--wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {state.rival.solo ? "Passing…" : state.rival.bot ? "The bot is thinking…" : `${state.rival.name} is thinking…`}
            </motion.div>
        );
    }

    // ---- banners, the chain, the result ----------------------------------------------------

    const result = state.result && !duel.playing ? state.result : null;
    const overlay = (
        <>
            {view.chain.length > 0 && (
                <div className="df-chain" aria-label="Chain">
                    {view.chain.map((l, i) => (
                        <div key={i} className={`df-chain__link df-chain__link--${l.side}`}>
                            <img src={cardImage(l.code)} alt={name(l.code)} />
                            <b>{i + 1}</b>
                        </div>
                    ))}
                </div>
            )}
            <AnimatePresence>
                {effects.banner && (
                    <motion.div key={effects.banner.key} className={`df-banner df-banner--${"side" in effects.banner ? effects.banner.side : "me"} df-banner--${effects.banner.kind}`}
                        initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.08 }} transition={{ type: "spring", stiffness: 380, damping: 26 }}>
                        {effects.banner.kind === "activate" && <>
                            <img src={cardImage(effects.banner.code)} alt="" />
                            <div><h3>{name(effects.banner.code)}</h3><p>Chain link {effects.banner.link} · {effects.banner.side === "me" ? "you" : view.opp.name}</p></div>
                        </>}
                        {effects.banner.kind === "turn" && <div><h3>{effects.banner.side === "me" ? "Your turn" : `${view.opp.name}'s turn`}</h3><p>Turn {effects.banner.turn}</p></div>}
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>{question}</AnimatePresence>
            {!duel.connected && !result && <div className="df-offline">Reconnecting…</div>}
            {state.retry && prompt && <div className="df-retry">That isn&apos;t allowed right now. Try another choice.</div>}
            {result && (
                <motion.div className="df-result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className={`df-result__card df-result__card--${result.winner ?? "draw"}`}>
                        <h2>{result.winner === "me" ? "You win!" : result.winner === "opp" ? `${view.opp.name} wins` : "A draw"}</h2>
                        <p>{result.reason}</p>
                        {!state.rival.bot && <p className="df-result__note">The result is booked on your series.</p>}
                        <button type="button" className="df-opt" onClick={() => onLeave(result.winner === "me" ? "win" : result.winner === "opp" ? "loss" : "draw")}>
                            {state.rival.bot ? "Back to the board" : result.winner === "me" ? "To your reward" : "To your pity packs"}
                        </button>
                    </div>
                </motion.div>
            )}
        </>
    );

    const detailCard = detail ? cards.get(detail) : null;
    const detailPanel = detailCard ? (
        <div className="df-detail">
            <img src={cardImage(detailCard.id)} alt={detailCard.name} />
            <CardPlate card={printedIn(detailCard, "", 0, "In this duel")} className="df-detail__plate" />
        </div>
    ) : <p className="df-detail__empty">Point at a card to read it.</p>;
    const logPanel = (
        <ol className="df-log__list">
            {log.map((l) => <li key={l.key} className={l.side ? `is-${l.side}` : ""}>{l.text}</li>)}
        </ol>
    );

    const props = { view, marks, onCard, onPile, onHover: setDetail, phaseBar, overlay };
    return (
        <div className={`df-arena ${duel.answered ? "is-sent" : ""}`}>
            <span className="df-experimental" title="Dueling in the app is still being built">Experimental</span>
            <LayoutGroup>
                {isPhone ? <PhoneBoard {...props} /> : <DesktopBoard {...props} detail={detailPanel} log={logPanel} />}
            </LayoutGroup>
            {closeUp && <CardCloseUp card={closeUp} onClose={() => setCloseUp(null)} />}
        </div>
    );
}

/** One line of the duel log, from the player's side of the table. */
function describe(e: DuelEvent, view: DuelView, name: (code: number) => string): string | null {
    const who = (s: Side | null) => (s === "me" ? "You" : view.opp.name);
    const cards = byUid(view);
    switch (e.k) {
        case "turn": return `Turn ${e.turn}: ${e.side === "me" ? "your" : `${view.opp.name}'s`} turn`;
        case "draw": return `${who(e.side)} drew ${e.count === 1 ? "a card" : `${e.count} cards`}`;
        case "summon": return `${who(e.side)} ${e.how === "normal" ? "Normal" : e.how === "flip" ? "Flip" : "Special"} Summoned ${name(e.code)}`;
        case "set": return `${who(e.side)} Set a card`;
        case "activate": return `${who(e.side)} activated ${name(e.code)} (chain link ${e.link})`;
        case "negated": return `Chain link ${e.link} was negated`;
        case "attack": {
            const a = e.attacker ? cards.get(e.attacker) : undefined, t = e.target ? cards.get(e.target) : undefined;
            return `${a?.code ? name(a.code) : "A monster"} attacked ${t ? (t.code ? name(t.code) : "a Set monster") : "directly"}`;
        }
        case "destroyed": return `${name(e.code)} was destroyed`;
        case "move":
            if (e.to === "hand" && e.from !== "deck") return `${e.code ? name(e.code) : "A card"} went back to ${e.side === "me" ? "your" : "their"} hand`;
            if (e.to === "hand") return e.code ? `${name(e.code)} was added to ${e.side === "me" ? "your" : "their"} hand` : null;
            if (e.to === "banished") return `${e.code ? name(e.code) : "A card"} was banished`;
            if (e.to === "grave" && (e.from === "hand" || e.from === "deck")) return `${name(e.code)} was sent to the Graveyard`;
            return null;
        case "damage": return `${who(e.side)} took ${e.amount} damage`;
        case "pay": return `${who(e.side)} paid ${e.amount} LP`;
        case "recover": return `${who(e.side)} gained ${e.amount} LP`;
        case "win": return e.side ? `${who(e.side)} won: ${e.reason}` : `A draw: ${e.reason}`;
        default: return null;
    }
}
