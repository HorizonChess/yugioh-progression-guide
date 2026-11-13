"use client";

import { isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { loneMust, zoneKey, type ActionVerb, type DuelCardView, type DuelEvent, type DuelPrompt, type DuelView, type Phase, type PlaceZone, type PromptCard, type Side, type Zone } from "@ygo/shared";
import { CardCloseUp, CardPlate } from "@/components/card/CardPlate";
import { printedIn, type StageCard } from "@/components/packs/stage/plate";
import { fetchCardsByIds, type Card } from "@/lib/api";
import { useIsPhone } from "@/lib/useIsPhone";
import { DesktopBoard, PhoneBoard } from "./Boards";
import { NameDeclare } from "./NameDeclare";
import { cardImage, type CardMarks, type Pose } from "./parts";
import { setDuelPrefs, useDuelPrefs } from "./duel-prefs";
import { sfx } from "./sfx";
import { useDuel } from "./useDuel";
import { useSteady } from "./useSteady";
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
        return [...v.hand, ...v.monsters, ...v.spells, v.field, ...v.pendulum, ...v.grave, ...v.banished, ...(v.extraCards ?? [])];
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

/**
 * Fades are run frame by frame, not handed to the browser: a browser-run opacity animation (framer's
 * "accelerated" path) drops its end value for one frame as it finishes, so a menu fading in blinks
 * out and one fading out blinks back. An `onUpdate` handler keeps framer on its own frame loop.
 */
const STEADY = { onUpdate: () => {} };

export default function DuelScreen({ duelId, onLeave }: { duelId: string; onLeave: (result: "win" | "loss" | "draw" | null) => void }) {
    const isPhone = useIsPhone();
    // A log line is worded when it's drawn, so a card whose name arrives later (one an effect
    // shows from a hidden hand) gets named once it's known.
    const [log, setLog] = useState<{ key: number; say: (name: (code: number) => string) => string; side?: Side }[]>([]);
    // Cards the view doesn't hold that events show (revealed from a hand or the Deck): their names are fetched too.
    const [shown, setShown] = useState<number[]>([]);
    const namesRef = useRef<(code: number) => string>(() => "a card");
    const onEvent = useCallback((e: DuelEvent, view: DuelView) => {
        if (e.k === "reveal" && e.codes.length) setShown((s) => [...new Set([...s, ...e.codes])]);
        if (e.k === "declare" && e.code) setShown((s) => [...new Set([...s, e.code!])]);
        if (!describe(e, view, namesRef.current)) return;
        const say = (name: (code: number) => string) => describe(e, view, name) ?? "";
        setLog((l) => [...l.slice(-199), { key: Math.random(), say, side: "side" in e ? (e.side ?? undefined) : undefined }]);
    }, []);
    const duel = useDuel(duelId, onEvent);
    const { state, view, prompt, effects } = duel;
    const cards = useCards([...codesOf(view, prompt), ...shown]);
    // Tokens aren't in the card catalog: their names come with them, and are kept once seen (a
    // destroyed token leaves the field for good, but the log still names it).
    const tokenNames = useRef(new Map<number, string>());
    if (view) for (const side of [view.me, view.opp]) for (const c of [...side.monsters, ...side.spells]) if (c?.token) tokenNames.current.set(c.code, c.token);
    const name = useCallback((code: number) => (code ? (cards.get(code)?.name ?? tokenNames.current.get(code) ?? "a card") : "a Set card"), [cards]);
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
    const [queuedTap, setQueuedTap] = useState<{ card: DuelCardView; side: Side; zone: Zone } | null>(null);
    const [held, setHeld] = useState<{ card: DuelCardView; side: Side; zone: Zone; at: { x: number; y: number } } | null>(null);
    /** What you last chose to do with a card: a Set monster goes in sideways, so its zone's sideways frame lights. */
    const [placing, setPlacing] = useState<ActionVerb | null>(null);
    const [browse, setBrowse] = useState<{ title: string; cards: DuelCardView[] } | null>(null);
    const [picked, setPicked] = useState<number[]>([]);
    /** "Yes" to "Activate a card?": the cards you can use now glow; tap one to use it. */
    const [choosing, setChoosing] = useState(false);
    /** The duel menu (⋯): closed, open, or asking to confirm a surrender. */
    const [duelMenu, setDuelMenu] = useState<"closed" | "open" | "surrender" | "log">("closed");
    /** A short note about the card you tapped (why it can't attack), for a few seconds. */
    const [notice, setNotice] = useState<{ uid: string; text: string } | null>(null);
    /** The question you swiped away to look at the board (by its key): it waits in a tab. */
    const [tucked, setTucked] = useState<string | null>(null);
    useEffect(() => {
        if (!notice) return;
        const t = setTimeout(() => setNotice(null), 3500);
        return () => clearTimeout(t);
    }, [notice]);
    const prefs = useDuelPrefs();
    // A new question starts with nothing chosen. (A card you picked up stays up, inert, until the
    // next question takes its place, and through choosing its zone or its Tributes.)
    const promptKey = state ? `${state.seq}:${prompt?.kind ?? ""}` : "";
    const keepHeld = prompt?.kind === "place" || (prompt?.kind === "cards" && !!prompt.tribute);
    useEffect(() => {
        /* eslint-disable react-hooks/set-state-in-effect -- reset per question */
        setPicked([]);
        setChoosing(false);
        if (!keepHeld) setHeld(null);
        /* eslint-enable react-hooks/set-state-in-effect */
    }, [promptKey, keepHeld]);

    const answer = duel.answer;
    // One zone to pick for a card: the zones glow and that's the question, with no bar. A tap off
    // the zones (or on the card again) puts the card back down, where the engine allows it.
    const quietPlace = prompt?.kind === "place" && prompt.count === 1 && !prompt.disable;
    // Choosing what to attack is as plain: the targets glow, and a tap off them calls the attack off.
    const quietAttack = prompt?.kind === "cards" && !!prompt.attack;
    const unplace = () => {
        if (duel.answered) return false;
        if (quietPlace && prompt.back) duel.back();
        else if (quietAttack && prompt.cancel) answer({ kind: "cancel" });
        else return false;
        sfx.putDown();
        return true;
    };

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

    // Cards you can tap where they lie. Not the rival's hand: it's a row of backs you can't pick from,
    // so a pick there (Confiscation) is a list: their faces if a card showed them to you, backs if not.
    const boardPick = prompt?.kind === "cards" && prompt.cards.every((c) => c.uid && ON_BOARD.includes(c.where) && !(c.where === "hand" && c.side === "opp"));
    const pickById = useMemo(() => new Map(prompt?.kind === "cards" ? prompt.cards.map((c) => [c.uid ?? `#${c.id}`, c]) : []), [prompt]);
    const marks: CardMarks = useMemo(() => {
        const glow = new Set<string>();
        const chosen = new Set<string>();
        if (prompt?.kind === "actions") prompt.actions.forEach((a) => a.uid && glow.add(a.uid));
        if (prompt?.kind === "chain" && (choosing || prompt.forced)) prompt.options.forEach((o) => o.uid && glow.add(o.uid));
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
    }, [prompt, boardPick, picked, effects, answer, placing, held, view, cards, choosing]);

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
        if (held?.card.uid === card.uid && unplace()) return;
        if (prompt?.kind === "cards" && boardPick) {
            const c = pickById.get(card.uid);
            if (c) return togglePick(c.id, prompt.max, prompt.min);
            const back = prompt.step?.chosen.find((x) => x.uid === card.uid);
            if (back) return answer({ kind: "choice", id: back.id });
        }
        // A card you can use now (after "Yes" to "Activate a card?") is picked up like one on your turn:
        // its choices pop up over it, with its details.
        const usable = prompt?.kind === "chain" && (choosing || prompt.forced) && prompt.options.some((o) => o.uid === card.uid);
        if (usable || (prompt?.kind === "actions" && prompt.actions.some((a) => a.uid === card.uid))) {
            // Pick the card up (or put it back down with a second tap). On wide screens it also shows in the detail panel.
            if (held?.card.uid === card.uid) {
                sfx.putDown();
                return setHeld(null);
            }
            // Where its choices pop up: just above the card (a hand card rises first).
            const el = document.querySelector(`[data-uid="${card.uid}"]`), arena = document.querySelector(".df-arena");
            const r = el?.getBoundingClientRect(), a = arena?.getBoundingClientRect();
            const at = r && a ? { x: r.left + r.width / 2 - a.left, y: r.top - a.top - (zone === "hand" ? r.height * 0.42 : 4) } : { x: 0, y: 0 };
            sfx.pickUp();
            setHeld({ card, side, zone, at });
            if (!isPhone && card.code) setDetail(card.code);
            return;
        }
        // Your own card tapped while your last answer is on its way, or while the reply is still
        // playing out: its actions are a moment away, so the tap waits for them (then picks it up)
        // rather than open the card.
        if (side === "me" && (duel.answered || (duel.playing && !!state?.prompt))) {
            setQueuedTap({ card, side, zone });
            return;
        }
        // A card waiting for its zone or its Tributes stays up whatever else you tap.
        if (!keepHeld) setHeld(null);
        // In the Battle Phase, a monster of yours with no attack offered says why, instead of nothing
        // happening (a second tap opens the card as usual).
        if (prompt?.kind === "actions" && prompt.phase === "battle" && side === "me" && zone === "monster" && card.faceUp && notice?.uid !== card.uid) {
            setNotice({
                uid: card.uid,
                text: card.defense ? "It's in Defense Position, so it can't attack." : "It can't attack right now: it has attacked already, or an effect on the field stops it (Gravity Bind, Swords of Revealing Light…).",
            });
            return;
        }
        if (card.code && (card.faceUp || side === "me")) look(card.code);
    };

    // A tap that waited for the board to catch up: once your actions are offered, it picks the card up.
    useEffect(() => {
        if (!queuedTap || duel.answered || duel.playing) return;
        setQueuedTap(null);
        if (prompt?.kind === "actions" && prompt.actions.some((a) => a.uid === queuedTap.card.uid)) onCard(queuedTap.card, queuedTap.side, queuedTap.zone);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- onCard is rebuilt every render
    }, [queuedTap, duel.answered, duel.playing, prompt]);

    // A phase tapped a moment early: taken once the reply offers it (and dropped if it doesn't).
    const [queuedPhase, setQueuedPhase] = useState<Phase | null>(null);
    useEffect(() => {
        if (!queuedPhase || duel.answered || duel.playing) return;
        setQueuedPhase(null);
        const next = prompt?.kind === "actions" ? prompt.next.find((n) => n.to === queuedPhase) : undefined;
        if (next) answer({ kind: "choice", id: next.id });
    }, [queuedPhase, duel.answered, duel.playing, prompt, answer]);

    const onPile = (side: Side, zone: "grave" | "banished" | "extra") => {
        if (!view) return;
        // Question: its first monster is named from memory, so the Graveyard stays shut meanwhile.
        if (zone === "grave" && view[side].graveHidden) return setNotice({ uid: `${side}:grave`, text: `You can't look at ${view.opp.name}'s Graveyard while Question is being resolved.` });
        // Only your own Extra Deck can be looked through (the server sends no one else's).
        const list = zone === "extra" ? view[side].extraCards ?? [] : view[side][zone];
        const what = zone === "grave" ? "Graveyard" : zone === "banished" ? "banished cards" : "Extra Deck";
        setBrowse({ title: `${side === "me" ? "Your" : `${view.opp.name}'s`} ${what}`, cards: zone === "extra" ? list : [...list].reverse() });
    };

    if (!state || !view) {
        return <div className="df-arena"><div className="df-loading">Shuffling the decks…</div></div>;
    }

    // ---- the phase bar --------------------------------------------------------------------

    // While your last move is on its way (or its reply is playing out) the bar stays as it was, so
    // it doesn't blink off and on with every tap; a phase tapped in that moment waits for the reply.
    const live = prompt?.kind === "actions" ? prompt : null;
    const barPrompt = live ?? (state.prompt?.kind === "actions" && (duel.answered || (duel.playing && view.turnPlayer === "me")) ? state.prompt : null);
    const nextIds = new Map(barPrompt ? barPrompt.next.map((n) => [n.to as Phase, n.id]) : []);
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
                            onClick={() => (id === undefined ? undefined : live ? answer({ kind: "choice", id }) : setQueuedPhase(p))}>
                            {p}
                        </button>
                    );
                })}
            </div>
            <button type="button" className="df-menu-btn" onClick={() => setDuelMenu("open")} aria-label="Duel menu">⋯</button>
        </div>
    );

    // ---- the question, as a sheet (phones) or a panel (wide screens) ---------------------

    // A sheet swiped down on a phone: a question tucks away into a tab (look at the board, tap the
    // tab to answer); anything else (the duel menu, a list of cards) closes.
    // A pick of cards where they lie that takes cards from your hand too (Polymerization's materials,
    // a Quick-Play to chain): its bar sits above the hand, which a phone's bar would otherwise cover.
    const handPick = prompt?.kind === "cards" ? prompt.cards.some((c) => c.side === "me" && c.where === "hand")
        : prompt?.kind === "chain" ? prompt.options.some((o) => o.where === "hand") : false;
    const sheet = (title: string, body: ReactNode, opts: { text?: string; code?: number; compact?: boolean; onSwipe?: () => void } = {}) => (
        !opts.onSwipe && tucked === promptKey ? (
            <motion.button key="tab" type="button" className="df-tab" {...STEADY} onClick={() => setTucked(null)}
                initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}>
                <span aria-hidden>▲</span> {title}
            </motion.button>
        ) : (
        // A question is keyed "sheet" (it stays up through the gap to the next one); something you
        // opened yourself (the duel menu, a list of cards) is "menu", and goes as soon as you close it.
        <motion.div key={opts.onSwipe ? "menu" : "sheet"} {...STEADY} className={`df-sheet ${opts.compact ? "df-sheet--compact" : ""} ${opts.compact && handPick ? "df-sheet--over-hand" : ""}`}
            initial={{ y: "70%", opacity: 1 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "70%", opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 36 }}
            drag={isPhone ? "y" : false} dragDirectionLock dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.9 }}
            onDragEnd={(_, info) => {
                if (info.offset.y > 70 || info.velocity.y > 500) (opts.onSwipe ?? (() => setTucked(promptKey)))();
            }}>
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
        )
    );
    const option = (label: string, run: () => void, extra: { note?: string; disabled?: boolean; quiet?: boolean } = {}) => (
        <button key={label + (extra.note ?? "")} type="button" className={`df-opt ${extra.quiet ? "df-opt--quiet" : ""}`} disabled={extra.disabled} onClick={run}>
            <span>{label}</span>{extra.note && <small>{extra.note}</small>}
        </button>
    );
    // Taking back the move being set up (its zone, position or Tributes), when the question allows it.
    const backOption = (p: { back?: boolean }) => p.back && option("Back", () => duel.back(), { quiet: true });
    // `ordered`: the order they're picked in counts (the first goes on top), so each picked card shows its place.
    const listPick = (list: PromptCard[], selected: number[], onTap: (id: number) => void, ordered?: boolean) => (
        <div className="df-sheet__list">
            {list.map((c) => (
                <button key={c.id} type="button" className={`df-listcard ${selected.includes(c.id) ? "is-picked" : ""}`} onClick={() => onTap(c.id)}>
                    <img src={c.code ? cardImage(c.code) : cardImage(0)} alt="" />
                    {ordered && selected.includes(c.id) && <b className="df-listcard__order">{selected.indexOf(c.id) + 1}</b>}
                    <span>{c.code ? name(c.code) : c.where === "hand" ? "A card in their hand" : "Face-down card"}</span>
                    <small>{c.side === "opp" ? `${view.opp.name}'s ` : ""}{c.where === "grave" ? "Graveyard" : c.where === "banished" ? "banished" : c.where === "deck" ? "Deck" : c.where === "extra" ? "Extra Deck" : c.where}</small>
                </button>
            ))}
        </div>
    );

    // The card that's asking, when one is: the chain link being activated or resolved.
    const askingLink = view.chain[view.chain.length - 1];
    const askedBy = askingLink ? { code: askingLink.code, text: `For ${name(askingLink.code)}` } : {};
    // While the rival's Question is being resolved their Graveyard is shut, and so is the list of what went there.
    const logShut = !!view.opp.graveHidden;

    let question: ReactNode = null;
    // The card you've picked up: what you can do with it, in the bar above your hand.
    const heldActions = held && prompt?.kind === "actions" ? prompt.actions.filter((a) => a.uid === held.card.uid) : [];
    const heldChain = held && prompt?.kind === "chain" ? prompt.options.filter((o) => o.uid === held.card.uid) : [];
    if (held && heldChain.length && !browse && duelMenu === "closed") {
        question = (
            <motion.div key={`held:${held.card.uid}`} {...STEADY} className="df-pop" style={{ left: `clamp(70px, ${held.at.x}px, calc(100% - 70px))`, top: held.at.y }}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", stiffness: 520, damping: 30 }}>
                {heldChain.map((o) => (
                    <button key={o.id} type="button" className="df-pop__btn" onClick={() => answer({ kind: "choice", id: o.id })}>
                        Activate
                        {o.text && heldChain.length > 1 && <small>{o.text}</small>}
                    </button>
                ))}
                {isPhone && held.card.code > 0 && <button type="button" className="df-pop__btn df-pop__btn--quiet" onClick={() => look(held.card.code)}>Details</button>}
            </motion.div>
        );
    } else if (held && (heldActions.length || duel.answeredKind === "actions") && !browse && duelMenu === "closed") {
        question = (
            // The card's choices pop up over it, Master Duel style: no strip across the screen.
            <motion.div key={`held:${held.card.uid}`} {...STEADY} className="df-pop" style={{ left: `clamp(70px, ${held.at.x}px, calc(100% - 70px))`, top: held.at.y }}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", stiffness: 520, damping: 30 }}>
                {heldActions.map((a) => (
                    <button key={a.id} type="button" className="df-pop__btn" onClick={() => choose(a)}>
                        {a.verb === "reposition" && !held.card.faceUp ? "Flip Summon" : actionLabel(a)}
                        {a.verb === "activate" && a.text && heldActions.filter((x) => x.verb === "activate").length > 1 && <small>{a.text}</small>}
                    </button>
                ))}
                {isPhone && held.card.code > 0 && <button type="button" className="df-pop__btn df-pop__btn--quiet" onClick={() => look(held.card.code)}>Details</button>}
            </motion.div>
        );
    } else if (browse) {
        question = sheet(browse.title, <><div className="df-sheet__list">{browse.cards.map((c) => (
            <button key={c.uid} type="button" className="df-listcard" onClick={() => look(c.code)}><img src={cardImage(c.code)} alt="" /><span>{name(c.code)}</span></button>
        ))}</div>{option("Close", () => setBrowse(null), { quiet: true })}</>, { onSwipe: () => setBrowse(null) });
    } else if (duelMenu === "surrender") {
        question = sheet("Surrender this duel?", <div className="df-sheet__options">{option("Surrender", () => (setDuelMenu("closed"), duel.concede()))}{option("Keep dueling", () => setDuelMenu("closed"), { quiet: true })}</div>, { text: state.rival.bot ? "It's only practice." : `${state.rival.name} wins the duel, and the result counts for the series.`, onSwipe: () => setDuelMenu("closed") });
    } else if (duelMenu === "log") {
        // Phones have no room for the log beside the board: it's here, the latest first.
        question = sheet("What happened", <>
            {logShut ? <p className="df-sheet__text">Closed while Question is being resolved: its answer is in here.</p>
                : <ol className="df-log__list df-log__list--sheet" onPointerDown={(e) => e.stopPropagation() /* scrolls; doesn't drag the sheet */}>{[...log].reverse().map((l) => <li key={l.key} className={l.side ? `is-${l.side}` : ""}>{l.say(name)}</li>)}</ol>}
            <div className="df-sheet__options">{option("Back to the duel", () => setDuelMenu("closed"), { quiet: true })}</div>
        </>, { onSwipe: () => setDuelMenu("closed") });
    } else if (duelMenu === "open") {
        question = sheet("Duel menu", <div className="df-sheet__options">
            {option(prefs.sound ? "Sound: on" : "Sound: off", () => setDuelPrefs({ sound: !prefs.sound }), { note: "The duel's sound effects" })}
            {option(prefs.chain === "auto" ? "Ask me to respond: when it matters" : "Ask me to respond: at every chance", () => setDuelPrefs({ chain: prefs.chain === "auto" ? "always" : "auto" }), {
                note: prefs.chain === "auto" ? "Only when your rival plays something, or a card of yours is made for the moment" : "Stops at every point where a card of yours could be activated",
            })}
            {isPhone && option("What happened", () => setDuelMenu("log"), { note: "The duel so far, move by move" })}
            {option("Surrender", () => setDuelMenu("surrender"))}
            {option("Back to the duel", () => setDuelMenu("closed"), { quiet: true })}
        </div>, { text: "Dueling in the app is experimental: if something looks wrong, tell us what happened.", onSwipe: () => setDuelMenu("closed") });
    } else if (prompt) {
        switch (prompt.kind) {
            case "actions":
                // Nothing on screen: glowing cards can be used, and the phase bar moves the turn on.
                break;
            case "chain": {
                const last = view.chain[view.chain.length - 1];
                // First a plain yes or no. "Yes": the cards you can use now glow, and you pick one up like
                // on your own turn (its details a tap away). Forced effects (several that must happen at
                // once) skip the yes or no: only their order is yours.
                // On top of a card of your own (your rival let it be): another card of yours can join the chain.
                // One effect that must happen, with cards you could use before it (seen only when you
                // asked to be stopped at every chance): say which one it is, and that the rest can wait.
                const musts = [...new Set(prompt.options.filter((o) => o.must).map((o) => name(o.code)))];
                const lone = loneMust(prompt) !== null, extras = prompt.forced && prompt.options.some((o) => !o.must);
                const forcedHint = lone ? "Tap it to go on, or use another glowing card first"
                    : extras ? `${musts.join(" and ")} can't be skipped; the one you pick first resolves last. Your other glowing cards are optional`
                    : "None can be skipped; the one you pick first resolves last. Tap a glowing card";
                const title = prompt.forced ? (lone ? `${musts[0]}'s effect happens now` : "These all happen: which goes on the chain first?") : !last ? (prompt.ask ?? "Activate a card?") : last.side === "me" ? "Chain another card?" : `Respond to ${name(last.code)}?`;
                const said = last ? `${last.side === "me" ? "You" : view.opp.name} activated it as chain link ${view.chain.length}.` : undefined;
                if (!choosing && !prompt.forced) {
                    question = sheet(title, (
                        <div className="df-sheet__options df-sheet__options--row">
                            {option("Yes", () => setChoosing(true))}
                            {prompt.pass !== null && option("No", () => answer({ kind: "choice", id: prompt.pass! }), { quiet: true })}
                        </div>
                    ), { text: said, code: last?.code });
                    break;
                }
                // Cards that can't be tapped where they lie (in a Graveyard, banished, in a Deck): buttons.
                const seen = new Set<string>(), shown = byUid(view);
                const offBoard = prompt.options.filter((o) => {
                    if (o.uid && ON_BOARD.includes(o.where) && shown.has(o.uid)) return false;
                    const k = `${o.code}:${o.text ?? ""}:${o.where}`;
                    return seen.has(k) ? false : (seen.add(k), true);
                });
                question = sheet(title, (
                    <div className="df-sheet__bar">
                        <span>{prompt.forced ? forcedHint : "Tap a glowing card to use it"}</span>
                        {offBoard.map((o) => option(name(o.code), () => answer({ kind: "choice", id: o.id }), { note: o.text }))}
                        {!prompt.forced && option("Back", () => (setHeld(null), setChoosing(false)), { quiet: true })}
                    </div>
                ), { compact: true });
                break;
            }
            case "cards": {
                const ready = picked.length >= prompt.min && picked.length <= prompt.max;
                const confirm = !prompt.step && !(prompt.max === 1 && prompt.min === 1) && option(`Confirm (${picked.length}/${prompt.max})`, () => answer({ kind: "many", ids: picked }), { disabled: !ready });
                const finish = prompt.step?.canFinish && option("Done", () => answer({ kind: "done" }));
                const cancel = prompt.cancel ? option("Cancel", () => answer({ kind: "cancel" }), { quiet: true }) : backOption(prompt);
                const asking = !prompt.tribute ? askingLink : undefined;
                const about = asking ? askedBy : {};
                question = boardPick && prompt.attack ? null : boardPick
                    ? sheet(prompt.title, <div className="df-sheet__bar"><span>{asking ? `For ${name(asking.code)}: tap` : "Tap"} the glowing cards{prompt.sum ? ` (total ${prompt.sum})` : ""}</span>{confirm}{finish}{cancel}</div>, { compact: true })
                    : sheet(prompt.title, <>{listPick(prompt.cards, prompt.step ? prompt.step.chosen.map((c) => c.id) : picked, (id) => togglePick(id, prompt.max, prompt.min), prompt.ordered)}<div className="df-sheet__options df-sheet__options--row">{confirm}{finish}{cancel}</div></>, about);
                break;
            }
            case "yesno":
                question = sheet(prompt.title, <div className="df-sheet__options df-sheet__options--row">{option("Yes", () => answer({ kind: "choice", id: 1 }))}{option("No", () => answer({ kind: "choice", id: 0 }), { quiet: true })}</div>, prompt.code ? { code: prompt.code } : askedBy);
                break;
            case "option":
            case "number":
                question = sheet(prompt.title, <div className="df-sheet__options">{prompt.options.map((o) => option("text" in o ? o.text : o.label, () => answer({ kind: "choice", id: o.id })))}</div>, askedBy);
                break;
            case "position":
                question = sheet(`${name(prompt.code)}: which position?`, <div className="df-sheet__options">{prompt.options.map((o) => option(o.label, () => answer({ kind: "choice", id: o.id })))}{backOption(prompt)}</div>, { code: prompt.code });
                break;
            case "declare":
                question = sheet(prompt.title, <>
                    <div className="df-sheet__chips">{prompt.options.map((o) => (
                        <button key={o.id} type="button" className={`df-chip ${picked.includes(o.id) ? "is-on" : ""}`} onClick={() => setPicked((p) => (p.includes(o.id) ? p.filter((x) => x !== o.id) : p.length < prompt.count ? [...p, o.id] : p))}>{o.label}</button>
                    ))}</div>
                    <div className="df-sheet__options">{option("Declare", () => answer({ kind: "many", ids: picked }), { disabled: picked.length !== prompt.count })}</div>
                </>, askedBy);
                break;
            case "place": {
                // The zones glow, and a tap on one puts the card there. For one zone that's all
                // (see quietPlace); several zones, or zones to disable, keep a bar with the count.
                if (quietPlace) break;
                question = sheet(prompt.title, (
                    <div className="df-sheet__bar">
                        <span>Tap a glowing zone</span>
                        {prompt.count > 1 && option(`Confirm (${picked.length}/${prompt.count})`, () => answer({ kind: "many", ids: picked }), { disabled: picked.length !== prompt.count })}
                        {backOption(prompt)}
                    </div>
                ), { compact: true });
                break;
            }
            case "card-name":
                // Typed, then picked from the matches. For Question the rival's Graveyard is shut: say so.
                question = sheet(prompt.title, <NameDeclare key={promptKey} only={prompt.only} disabled={duel.answered} onDeclare={(text, code) => answer({ kind: "name", name: text, ...(code ? { code } : {}) })} />, {
                    code: askingLink?.code,
                    text: view.opp.graveHidden ? `For ${name(askingLink?.code ?? 0)}: name the first monster in ${view.opp.name}'s Graveyard (the one at the bottom). You can't look.` : askedBy.text,
                });
                break;
        }
    } else if (waiting && slow) {
        question = (
            <motion.div key="wait" {...STEADY} className="df-hint df-hint--wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
                    <motion.div key={effects.banner.key} {...STEADY} className={`df-banner df-banner--${"side" in effects.banner ? effects.banner.side : "me"} df-banner--${effects.banner.kind}`}
                        initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.08 }} transition={{ type: "spring", stiffness: 380, damping: 26 }}>
                        {effects.banner.kind === "activate" && <>
                            <img src={cardImage(effects.banner.code)} alt="" />
                            <div><h3>{name(effects.banner.code)}</h3><p>Chain link {effects.banner.link} · {effects.banner.side === "me" ? "you" : view.opp.name}</p></div>
                        </>}
                        {effects.banner.kind === "turn" && <div><h3>{effects.banner.side === "me" ? "Your turn" : `${view.opp.name}'s turn`}</h3><p>Turn {effects.banner.turn}</p></div>}
                        {effects.banner.kind === "coin" && (() => {
                            const b = effects.banner;
                            const who = (side: Side) => (side === "me" ? "You" : view.opp.name);
                            const word = (r: "heads" | "tails") => (r === "heads" ? "Heads" : "Tails");
                            return (
                                <div className="df-toss">
                                    <p>{b.call ? `${who(b.call.side)} call${b.call.side === "me" ? "" : "s"} ${b.call.heads ? "Heads" : "Tails"}` : `${who(b.side)} toss${b.side === "me" ? "" : "es"} a coin`}</p>
                                    <div className="df-toss__coins">
                                        {b.results.map((r, i) => (
                                            <span key={i} className={`df-coin is-${r}`} style={{ animationDelay: `${i * 0.15}s` }}>
                                                <i className="df-coin__face df-coin__face--heads">H</i>
                                                <i className="df-coin__face df-coin__face--tails">T</i>
                                            </span>
                                        ))}
                                    </div>
                                    <h3 className="df-toss__result">
                                        {b.results.map(word).join(", ")}
                                        {b.call && b.results.length === 1 ? ((b.results[0] === "heads") === b.call.heads ? " · called right" : " · called wrong") : ""}
                                    </h3>
                                </div>
                            );
                        })()}
                        {effects.banner.kind === "declare" && (
                            <div className="df-declare">
                                <p>{effects.banner.side === "me" ? "You declare" : `${view.opp.name} declares`}</p>
                                <b>{effects.banner.code ? name(effects.banner.code) : effects.banner.text}</b>
                            </div>
                        )}
                        {effects.banner.kind === "reveal" && (
                            <div className="df-reveal">
                                <p>{revealWords(effects.banner, view.opp.name)}</p>
                                {effects.banner.codes.length > 0 && (
                                    <div className="df-reveal__cards">
                                        {effects.banner.codes.map((c, i) => <img key={i} src={cardImage(c)} alt={name(c)} style={{ animationDelay: `${i * 0.08}s` }} />)}
                                    </div>
                                )}
                            </div>
                        )}
                        {effects.banner.kind === "dice" && (
                            <div className="df-toss">
                                <p>{effects.banner.side === "me" ? "You roll" : `${view.opp.name} rolls`}</p>
                                <div className="df-toss__coins">
                                    {effects.banner.results.map((r, i) => <span key={i} className="df-die" style={{ animationDelay: `${i * 0.15}s` }}>{"⚀⚁⚂⚃⚄⚅"[r - 1] ?? r}</span>)}
                                </div>
                                <h3 className="df-toss__result">{effects.banner.results.join(", ")}</h3>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Cards on their way from a deck stay hidden where they'll land until they arrive. */}
            {effects.dealing.length > 0 && <style>{`${effects.dealing.map((u) => `[data-uid="${u}"]`).join(",")}{opacity:0 !important}`}</style>}
            {/* Held only while your answer is on its way (a moment): a question waiting behind the reply's
                animations doesn't keep the old one up, stale, all that time. */}
            <SteadyQuestion question={question} hold={duel.answered} />
            <AnimatePresence>
                {notice && (
                    <motion.div key={notice.uid} {...STEADY} className="df-notice" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => setNotice(null)}>
                        {notice.text}
                    </motion.div>
                )}
            </AnimatePresence>
            {!duel.connected && !result && <div className="df-offline">Reconnecting…</div>}
            {state.retry && prompt && <div className="df-retry">That isn&apos;t allowed right now. Try another choice.</div>}
            {result && (
                <motion.div className="df-result" {...STEADY} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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
    const logPanel = logShut ? <p className="df-detail__empty">Closed while Question is being resolved.</p> : (
        <ol className="df-log__list">
            {log.map((l) => <li key={l.key} className={l.side ? `is-${l.side}` : ""}>{l.say(name)}</li>)}
        </ol>
    );

    const props = { view, marks, onCard, onPile, onHover: setDetail, phaseBar, overlay };
    return (
        <div
            className={`df-arena ${duel.answered ? "is-sent" : ""}`}
            // A tap anywhere else puts a picked-up card back down.
            onClick={(e) => {
                if ((e.target as Element).closest(".df-pop, [data-uid], .df-zone__pick")) return;
                if (unplace()) return;
                if (held && !keepHeld && !duel.answered) {
                    sfx.putDown();
                    setHeld(null);
                }
            }}
        >
            <span className="df-experimental" title="Dueling in the app is still being built">Experimental</span>
            <LayoutGroup>
                {isPhone ? <PhoneBoard {...props} /> : <DesktopBoard {...props} detail={detailPanel} log={logPanel} />}
            </LayoutGroup>
            {closeUp && <CardCloseUp card={closeUp} onClose={() => setCloseUp(null)} />}
        </div>
    );
}

/** One line of the duel log, from the player's side of the table. */
/**
 * The question on screen. A sheet stays up, inert, through the moment between one question and
 * the next (see useSteady): the next one takes its place where it stands, so menus never blink.
 */
function SteadyQuestion({ question, hold }: { question: ReactNode; hold: boolean }) {
    const sheet = isValidElement(question) && question.key === "sheet";
    const { value, lingering } = useSteady(question ? { node: question, linger: sheet } : null, 450, hold);
    return (
        <div className={`df-question ${lingering ? "is-lingering" : ""}`}>
            <AnimatePresence>{value?.node}</AnimatePresence>
        </div>
    );
}

function describe(e: DuelEvent, view: DuelView, name: (code: number) => string): string | null {
    const who = (s: Side | null) => (s === "me" ? "You" : view.opp.name);
    const cards = byUid(view);
    switch (e.k) {
        case "turn": return `Turn ${e.turn}: ${e.side === "me" ? "your" : `${view.opp.name}'s`} turn`;
        case "draw": return `${who(e.side)} drew ${e.count === 1 ? "a card" : `${e.count} cards`}`;
        case "hand-shuffle": return `${e.side === "me" ? "Your" : `${view.opp.name}'s`} hand was shuffled`;
        case "summon": return `${who(e.side)} ${e.how === "normal" ? "Normal" : e.how === "flip" ? "Flip" : "Special"} Summoned ${name(e.code)}`;
        case "set": return `${who(e.side)} Set a card`;
        case "activate": return `${who(e.side)} activated ${name(e.code)} (chain link ${e.link})`;
        case "negated": return `Chain link ${e.link} was negated`;
        case "attack": {
            const a = e.attacker ? cards.get(e.attacker) : undefined, t = e.target ? cards.get(e.target) : undefined;
            return `${a?.code ? name(a.code) : "A monster"} attacked ${t ? (t.code ? name(t.code) : "a Set monster") : "directly"}`;
        }
        case "declare": {
            const what = e.code ? name(e.code) : e.text;
            return `${e.side === "me" ? "You declared" : `${view.opp.name} declared`} ${e.what === "number" ? `the number ${what}` : what}`;
        }
        case "reveal": {
            const list = e.codes.length ? `: ${e.codes.map(name).join(", ")}` : "";
            return `${revealWords(e, view.opp.name)}${list}`;
        }
        case "random": {
            const picked = e.uids.map((u) => cards.get(u)).filter((c): c is NonNullable<typeof c> => !!c);
            return `Picked at random: ${picked.length ? picked.map((c) => (c.code ? name(c.code) : "a card")).join(", ") : `${e.uids.length} card${e.uids.length === 1 ? "" : "s"}`}`;
        }
        case "attack-negated": {
            const a = e.attacker ? cards.get(e.attacker) : undefined;
            return `${a?.code ? `${name(a.code)}'s` : "The"} attack was negated`;
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
        case "lp": return `${e.side === "me" ? "Your" : `${view.opp.name}'s`} Life Points became ${e.lp} (from ${e.was})`;
        case "win": return e.side ? `${who(e.side)} won: ${e.reason}` : `A draw: ${e.reason}`;
        default: return null;
    }
}

/** What a reveal is, in words: who shows what to whom ("Practice Bot reveals from the top of the Deck"). */
function revealWords(r: { side: Side; by: Side | null; from: string; count: number }, rival: string): string {
    const n = `${r.count} card${r.count === 1 ? "" : "s"}`;
    const deck = r.from === "deck" ? " from the top of the Deck" : r.from === "hand" ? " from the hand" : "";
    if (r.by === null) return `${r.side === "me" ? "You reveal" : `${rival} reveals`} ${n}${deck}`;
    if (r.by === r.side) return r.side === "me" ? `You look at ${n}${deck}` : `${rival} looks at ${n} of their own`;
    return r.by === "me" ? `${rival} shows you ${n}${deck}` : `You show ${rival} ${n}${deck}`;
}
