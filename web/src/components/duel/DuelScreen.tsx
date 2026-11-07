"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { ActionVerb, DuelCardView, DuelEvent, DuelPrompt, DuelView, Phase, PromptCard, Side, Zone } from "@ygo/shared";
import { CardCloseUp, CardPlate } from "@/components/card/CardPlate";
import { printedIn, type StageCard } from "@/components/packs/stage/plate";
import { fetchCardsByIds, type Card } from "@/lib/api";
import { useIsPhone } from "@/lib/useIsPhone";
import { DesktopBoard, PhoneBoard } from "./Boards";
import { cardImage, type CardMarks } from "./parts";
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

type Menu = { title: string; code?: number; text?: string; options: { label: string; note?: string; run: () => void }[] };

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

    const [menu, setMenu] = useState<Menu | null>(null);
    const [browse, setBrowse] = useState<{ title: string; cards: DuelCardView[] } | null>(null);
    const [picked, setPicked] = useState<number[]>([]);
    const [nameGuess, setNameGuess] = useState("");
    const [surrender, setSurrender] = useState(false);
    // A new question starts with nothing chosen.
    const promptKey = state ? `${state.seq}:${prompt?.kind ?? ""}` : "";
    useEffect(() => {
        /* eslint-disable react-hooks/set-state-in-effect -- reset per question */
        setPicked([]);
        setMenu(null);
        /* eslint-enable react-hooks/set-state-in-effect */
    }, [promptKey]);

    const answer = duel.answer;

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
        return { glow, picked: chosen, destroying: effects.destroying, floats: effects.floats };
    }, [prompt, boardPick, picked, effects]);

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
        if (prompt?.kind === "actions") {
            const actions = prompt.actions.filter((a) => a.uid === card.uid);
            if (actions.length) {
                return setMenu({
                    title: name(card.code),
                    code: card.code,
                    options: [
                        ...actions.map((a) => ({ label: a.verb === "attack-direct" ? "Attack" : VERB[a.verb], note: a.text && a.verb === "activate" ? a.text : undefined, run: () => answer({ kind: "choice", id: a.id }) })),
                        ...(card.code ? [{ label: "Look at the card", run: () => look(card.code) }] : []),
                    ],
                });
            }
        }
        if (card.code && (card.faceUp || side === "me")) look(card.code);
        void zone;
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
            <button type="button" className="df-menu-btn" onClick={() => setSurrender(true)} aria-label="Duel menu">⋯</button>
        </div>
    );

    // ---- the question, as a sheet (phones) or a panel (wide screens) ---------------------

    const sheet = (title: string, body: ReactNode, opts: { text?: string; code?: number; compact?: boolean } = {}) => (
        <motion.div key={`${promptKey}:${title}`} className={`df-sheet ${opts.compact ? "df-sheet--compact" : ""}`}
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
    if (menu) {
        question = sheet(menu.title, <div className="df-sheet__options">{menu.options.map((o) => option(o.label, () => (setMenu(null), o.run()), { note: o.note }))}{option("Cancel", () => setMenu(null), { quiet: true })}</div>, { code: menu.code });
    } else if (browse) {
        question = sheet(browse.title, <><div className="df-sheet__list">{browse.cards.map((c) => (
            <button key={c.uid} type="button" className="df-listcard" onClick={() => look(c.code)}><img src={cardImage(c.code)} alt="" /><span>{name(c.code)}</span></button>
        ))}</div>{option("Close", () => setBrowse(null), { quiet: true })}</>);
    } else if (surrender) {
        question = sheet("Surrender this duel?", <div className="df-sheet__options">{option("Surrender", () => (setSurrender(false), duel.concede()))}{option("Keep dueling", () => setSurrender(false), { quiet: true })}</div>, { text: state.rival.bot ? "It's only practice." : `${state.rival.name} wins the duel, and the result counts for the series.` });
    } else if (prompt) {
        switch (prompt.kind) {
            case "actions":
                question = (
                    <div className="df-hint">
                        {prompt.actions.length ? "Tap a glowing card to use it" : "Nothing to do here"}
                        {prompt.next.map((n) => <button key={n.id} type="button" className="df-hint__btn" onClick={() => answer({ kind: "choice", id: n.id })}>{n.to === "BP" ? "Battle" : n.to === "M2" ? "Main 2" : "End turn"}</button>)}
                    </div>
                );
                break;
            case "chain": {
                const last = view.chain[view.chain.length - 1];
                question = sheet(prompt.forced ? "Activate an effect" : last ? `Respond to ${name(last.code)}?` : "Activate a card?", (
                    <div className="df-sheet__options">
                        {prompt.options.map((o) => option(name(o.code), () => answer({ kind: "choice", id: o.id }), { note: o.text }))}
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
            case "card-name":
                question = sheet(prompt.title, <form className="df-sheet__form" onSubmit={(e) => (e.preventDefault(), answer({ kind: "name", name: nameGuess }))}>
                    <input className="df-input" value={nameGuess} onChange={(e) => setNameGuess(e.target.value)} placeholder="Exact card name, e.g. Dark Magician" autoFocus />
                    {option("Declare", () => answer({ kind: "name", name: nameGuess }), { disabled: !nameGuess.trim() })}
                </form>);
                break;
        }
    } else if (!duel.playing && !state.result) {
        question = <div className="df-hint df-hint--wait">{state.rival.bot ? "The bot is thinking…" : `${state.rival.name} is thinking…`}</div>;
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
        <div className="df-arena">
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
