"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { CardCloseUp } from "@/components/card/CardPlate";
import { printedIn, type StageCard } from "@/components/packs/stage/plate";
import { fetchCardsByIds, type Card } from "@/lib/api";
import {
    ID, PHASES, infoOf, freeZone, initialDuel, lift, locate, statsOf,
    type Duel, type Inst, type Phase, type Side, type Who,
} from "./mock-duel";
import "./duel-board.css";

const IMG = process.env.NEXT_PUBLIC_IMAGE_HOST ?? "";
const face = (id: number) => `${IMG}/cards/${id}_md.jpg`;
const BACK = `${IMG}/cards/back_high.jpg`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What the board is asking the player. These are the shapes the engine's questions will take. */
type Option = { label: string; value: string; disabled?: boolean; note?: string };
type Prompt =
    | { kind: "menu"; title: string; text?: string; options: Option[]; cancel?: boolean }
    | { kind: "board"; title: string; candidates: string[]; count: number; picked: string[]; cancel?: boolean }
    | { kind: "list"; title: string; text?: string; cards: Inst[]; browse?: boolean };

const PHASE_NAME: Record<Phase, string> = { DP: "Draw", SP: "Standby", M1: "Main 1", BP: "Battle", M2: "Main 2", EP: "End" };

export default function DuelBoard() {
    const [duel, setDuel] = useState<Duel>(initialDuel);
    // The async flows read the latest state from here; rendering reads `duel`.
    const live = useRef(duel);
    const update = useCallback((fn: (d: Duel) => void) => {
        const next = structuredClone(live.current);
        fn(next);
        live.current = next;
        setDuel(next);
    }, []);

    const [prompt, setPrompt] = useState<Prompt | null>(null);
    const answer = useRef<((v: unknown) => void) | null>(null);
    const ask = useCallback(<T,>(p: Prompt) => new Promise<T>((resolve) => {
        answer.current = resolve as (v: unknown) => void;
        setPrompt(p);
    }), []);
    const reply = (v: unknown) => {
        const r = answer.current;
        answer.current = null;
        setPrompt(null);
        r?.(v);
    };

    const busy = useRef(false);
    const run = (flow: () => Promise<void>) => {
        if (busy.current) return;
        busy.current = true;
        flow().finally(() => (busy.current = false));
    };

    // Card data for the close-up (names, text, stats), from the same source as the rest of the app.
    const [cards, setCards] = useState<Map<number, Card>>(new Map());
    useEffect(() => {
        fetchCardsByIds(Object.values(ID)).then((list) => setCards(new Map(list.map((c) => [c.id, c]))));
    }, []);
    const [closeUp, setCloseUp] = useState<StageCard | null>(null);
    const view = (id: number) => {
        const c = cards.get(id);
        if (c) setCloseUp(printedIn(c, "LOB-000", 0, "In this duel"));
    };

    // ---- effects on the board -------------------------------------------------------------

    const floatSeq = useRef(0);
    const float = (f: { uid?: string; lp?: Who; text: string; tone: "up" | "down" }) => {
        const key = ++floatSeq.current;
        update((d) => void d.floats.push({ key, ...f }));
        setTimeout(() => update((d) => void (d.floats = d.floats.filter((x) => x.key !== key))), 1300);
    };

    const banner = async (id: number, owner: Who, title: string, sub: string) => {
        update((d) => void (d.banner = { key: Date.now(), id, owner, title, sub }));
        await sleep(1100);
        update((d) => void (d.banner = null));
        await sleep(200);
    };

    const toGraveyard = async (uids: string[], destroyed = true) => {
        if (destroyed) {
            update((d) => void (d.destroying = [...d.destroying, ...uids]));
            await sleep(480);
        }
        update((d) => {
            for (const uid of uids) {
                const at = locate(d, uid);
                const c = lift(d, uid);
                if (!c || !at) continue;
                d[at.who].gy.push({ ...c, face: "up", pos: "atk", boost: 0, attacked: false });
            }
            d.destroying = d.destroying.filter((u) => !uids.includes(u));
        });
        await sleep(450);
    };

    const damage = async (who: Who, amount: number) => {
        if (amount <= 0) return;
        float({ lp: who, text: `−${amount}`, tone: "down" });
        update((d) => void (d[who].lp = Math.max(0, d[who].lp - amount)));
        await sleep(700);
    };

    // ---- scripted flows (the engine will drive these for real) ------------------------------

    /** The rival's Trap Hole answers the first summon of a monster with 1000 or more ATK. */
    const rivalTrapHole = async (target: string) => {
        const d0 = live.current;
        const hole = d0.opp.spells.find((c) => c?.id === ID.TRAP_HOLE && c.face === "down");
        const t = locate(d0, target);
        if (!hole || !t || statsOf(d0, t.card).atk < 1000) return;
        update((d) => {
            const h = locate(d, hole.uid)!;
            h.card.face = "up";
            d.chain.push({ uid: hole.uid, id: ID.TRAP_HOLE, owner: "opp" });
        });
        await banner(ID.TRAP_HOLE, "opp", "Trap Hole", "Chain Link 1 · your rival");

        const mine = live.current.me.spells.filter((c): c is Inst => !!c && c.face === "down" && infoOf(c.id).kind === "trap");
        const pick = await ask<string>({
            kind: "menu",
            title: "Chain to Trap Hole?",
            text: `Your rival's Trap Hole will destroy ${infoOf(t.card.id).name}.`,
            options: [
                ...mine.map((c) => ({ label: `Activate ${infoOf(c.id).name}`, value: c.uid })),
                { label: "Don't chain", value: "" },
            ],
        });
        if (pick) {
            const c = locate(live.current, pick)!.card;
            let target2: string | null = null;
            if (c.id === ID.REINFORCEMENTS) {
                const faceUp = (["me", "opp"] as const).flatMap((w) => live.current[w].monsters).filter((m): m is Inst => !!m && m.face === "up");
                const [chosen] = await ask<string[]>({ kind: "board", title: "Reinforcements: choose 1 face-up monster", candidates: faceUp.map((m) => m.uid), count: 1, picked: [] });
                target2 = chosen ?? null;
            }
            update((d) => {
                locate(d, pick)!.card.face = "up";
                d.chain.push({ uid: pick, id: c.id, owner: "me" });
            });
            await banner(c.id, "me", infoOf(c.id).name, "Chain Link 2 · you");
            // A chain resolves last link first.
            if (c.id === ID.REINFORCEMENTS && target2) {
                update((d) => {
                    const m = locate(d, target2!)!.card;
                    m.boost = (m.boost ?? 0) + 500;
                    d.chain.pop();
                });
                float({ uid: target2, text: "+500", tone: "up" });
                await sleep(800);
                await toGraveyard([pick], false);
            }
            if (c.id === ID.DRAGON_CAPTURE_JAR) {
                // Continuous: it stays, and every face-up Dragon on the field goes to Defense Position.
                update((d) => {
                    for (const w of ["me", "opp"] as const)
                        for (const m of d[w].monsters) if (m && m.face === "up" && infoOf(m.id).race === "Dragon") m.pos = "def";
                    d.chain.pop();
                });
                await sleep(800);
            }
        }
        await sleep(250);
        await toGraveyard([target]);
        update((d) => void d.chain.pop());
        await toGraveyard([hole.uid], false);
    };

    const summon = async (c: Inst, set: boolean) => {
        const level = infoOf(c.id).level ?? 4;
        const tributes = level >= 7 ? 2 : level >= 5 ? 1 : 0;
        if (tributes) {
            const own = live.current.me.monsters.filter((m): m is Inst => !!m);
            const chosen = await ask<string[] | null>({
                kind: "board", title: `Choose ${tributes} monster${tributes > 1 ? "s" : ""} to tribute`,
                candidates: own.map((m) => m.uid), count: tributes, picked: [], cancel: true,
            });
            if (!chosen) return;
            await toGraveyard(chosen, false);
        }
        update((d) => {
            const card = lift(d, c.uid)!;
            d.me.monsters[freeZone(d.me.monsters)] = { ...card, face: set ? "down" : "up", pos: set ? "def" : "atk" };
            d.summoned = true;
        });
        await sleep(500);
        if (!set) await rivalTrapHole(c.uid);
    };

    /** A spell from the hand goes to a zone face up, resolves, then (if it's a Normal Spell) to the Graveyard. */
    const activate = async (c: Inst) => {
        update((d) => {
            const card = lift(d, c.uid)!;
            d.me.spells[freeZone(d.me.spells)] = { ...card, face: "up" };
            d.chain.push({ uid: c.uid, id: c.id, owner: "me" });
        });
        await banner(c.id, "me", infoOf(c.id).name, "Chain Link 1 · you");

        if (c.id === ID.FISSURE) {
            const d = live.current;
            const theirs = d.opp.monsters.filter((m): m is Inst => !!m && m.face === "up");
            const lowest = theirs.sort((a, b) => statsOf(d, a).atk - statsOf(d, b).atk)[0];
            if (lowest) await toGraveyard([lowest.uid]);
        }
        if (c.id === ID.MONSTER_REBORN) {
            const d = live.current;
            const dead = [...d.me.gy, ...d.opp.gy].filter((g) => infoOf(g.id).kind === "monster");
            const uid = await ask<string>({ kind: "list", title: "Monster Reborn", text: "Choose a monster from either Graveyard.", cards: dead });
            const pos = await ask<"atk" | "def">({
                kind: "menu", title: "Summon in which position?",
                options: [{ label: "Attack Position", value: "atk" }, { label: "Defense Position", value: "def" }],
            });
            update((d) => {
                const card = lift(d, uid)!;
                d.me.monsters[freeZone(d.me.monsters)] = { ...card, uid: card.uid, face: "up", pos };
            });
            await sleep(500);
        }
        update((d) => void d.chain.pop());
        await toGraveyard([c.uid], false);
    };

    const attack = async (attacker: Inst) => {
        const d = live.current;
        const targets = d.opp.monsters.filter((m): m is Inst => !!m);
        let target: string | null = null;
        if (targets.length) {
            const chosen = await ask<string[] | null>({ kind: "board", title: "Choose a monster to attack", candidates: targets.map((m) => m.uid), count: 1, picked: [], cancel: true });
            if (!chosen) return;
            target = chosen[0] ?? null;
        }
        update((d) => void (locate(d, attacker.uid)!.card.attacked = true));
        await lunge(attacker.uid, target);

        const now = live.current;
        const a = statsOf(now, locate(now, attacker.uid)!.card).atk;
        if (!target) return damage("opp", a);
        const tc = locate(now, target)!.card;
        if (tc.face === "down") {
            update((x) => void (locate(x, target!)!.card.face = "up"));
            await sleep(600);
        }
        const t = statsOf(live.current, tc);
        if (tc.pos === "atk") {
            if (a > t.atk) await Promise.all([toGraveyard([target]), damage("opp", a - t.atk)]);
            else if (a < t.atk) await Promise.all([toGraveyard([attacker.uid]), damage("me", t.atk - a)]);
            else await toGraveyard([target, attacker.uid]);
        } else {
            if (a > t.def) await toGraveyard([target]);
            else await damage("me", t.def - a);
        }
    };

    /** The attacker leaps at its target (or at the rival's side for a direct attack) and back. */
    const lunge = async (from: string, to: string | null) => {
        const el = document.querySelector<HTMLElement>(`[data-uid="${from}"] .duel-card__lunge`);
        const goal = to ? document.querySelector<HTMLElement>(`[data-uid="${to}"]`) : document.querySelector<HTMLElement>(".duel-info--opp");
        if (!el || !goal) return;
        const a = el.getBoundingClientRect(), b = goal.getBoundingClientRect();
        const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
        await el.animate(
            [
                { transform: "translate(0,0) scale(1)" },
                { transform: `translate(${-dx * 0.08}px, ${-dy * 0.08}px) scale(1.12)`, offset: 0.3 },
                { transform: `translate(${dx * 0.85}px, ${dy * 0.85}px) scale(1.18)`, offset: 0.62 },
                { transform: "translate(0,0) scale(1)" },
            ],
            { duration: 700, easing: "cubic-bezier(.3,.7,.3,1)" },
        ).finished;
    };

    // ---- taps --------------------------------------------------------------------------------

    const tapCard = (uid: string) => {
        if (prompt?.kind === "board") {
            if (!prompt.candidates.includes(uid)) return;
            const picked = prompt.picked.includes(uid) ? prompt.picked.filter((u) => u !== uid) : [...prompt.picked, uid];
            if (picked.length === prompt.count) return reply(picked);
            return setPrompt({ ...prompt, picked });
        }
        if (prompt || busy.current) return;
        const d = live.current;
        const at = locate(d, uid);
        if (!at) return;
        const c = at.card, info = infoOf(c.id);

        if (at.who === "me" && at.zone === "hand") {
            const main = d.phase === "M1" || d.phase === "M2";
            const tributes = (info.level ?? 0) >= 7 ? 2 : (info.level ?? 0) >= 5 ? 1 : 0;
            const ownMonsters = d.me.monsters.filter(Boolean).length;
            const options: Option[] =
                info.kind === "monster"
                    ? [
                        { label: "Normal Summon", value: "summon", disabled: !main || d.summoned || ownMonsters < tributes, note: d.summoned ? "Already summoned this turn" : tributes ? `Tribute ${tributes}` : undefined },
                        { label: "Set", value: "set", disabled: !main || d.summoned || ownMonsters < tributes },
                    ]
                    : info.kind === "spell"
                        ? [{ label: "Activate", value: "activate", disabled: !main }, { label: "Set", value: "setst", disabled: !main }]
                        : [{ label: "Set", value: "setst", disabled: !main }];
            return run(async () => {
                const v = await ask<string | null>({ kind: "menu", title: info.name, options: [...options, { label: "Look at the card", value: "view" }], cancel: true });
                if (v === "view") view(c.id);
                if (v === "summon" || v === "set") await summon(c, v === "set");
                if (v === "activate") await activate(c);
                if (v === "setst") update((x) => {
                    const card = lift(x, c.uid)!;
                    x.me.spells[freeZone(x.me.spells)] = { ...card, face: "down" };
                });
            });
        }
        if (at.who === "me" && at.zone === "monsters" && d.phase === "BP" && c.face === "up" && c.pos === "atk" && !c.attacked) {
            return run(async () => {
                const v = await ask<string | null>({ kind: "menu", title: info.name, options: [{ label: "Attack", value: "attack" }, { label: "Look at the card", value: "view" }], cancel: true });
                if (v === "view") view(c.id);
                if (v === "attack") await attack(c);
            });
        }
        // Your own face-down cards you may look at; the rival's you may not.
        if (c.face === "up" || at.who === "me") view(c.id);
    };

    const tapPile = (who: Who) => {
        if (prompt || busy.current) return;
        const gy = live.current[who].gy;
        if (!gy.length) return;
        run(async () => {
            const uid = await ask<string | null>({ kind: "list", title: `${who === "me" ? "Your" : "Rival's"} Graveyard`, cards: [...gy].reverse(), browse: true });
            if (uid) view(locate(live.current, uid)!.card.id);
        });
    };

    const tapPhase = (p: Phase) => {
        if (prompt || busy.current) return;
        const order = PHASES.indexOf(p), now = PHASES.indexOf(live.current.phase);
        if (order <= now) return;
        if (p === "EP") {
            update((d) => void (d.phase = "EP"));
            return run(async () => {
                const v = await ask<string>({ kind: "menu", title: "End of the mockup", text: "Your rival's turn would start here. The engine prototype is what will play it.", options: [{ label: "Play this turn again", value: "reset" }] });
                if (v === "reset") reset();
            });
        }
        update((d) => void (d.phase = p));
    };

    const reset = () => {
        const fresh = initialDuel();
        live.current = fresh;
        setDuel(fresh);
    };

    // ---- render ------------------------------------------------------------------------------

    const picking = prompt?.kind === "board" ? prompt : null;
    const cardProps = (c: Inst, who: Who) => ({
        c, who, duel,
        candidate: !!picking?.candidates.includes(c.uid),
        picked: !!picking?.picked.includes(c.uid),
        onTap: () => tapCard(c.uid),
    });

    const row = (cells: (Inst | null)[], who: Who, label: string) =>
        cells.map((c, i) => (
            <div key={`${label}${i}`} className="duel-slot">
                {c && <BoardCard {...cardProps(c, who)} />}
            </div>
        ));

    const side = (who: Who) => {
        const s = duel[who];
        const mirror = who === "opp";
        const monsters = mirror ? [...s.monsters].reverse() : s.monsters;
        const spells = mirror ? [...s.spells].reverse() : s.spells;
        const fieldSlot = (
            <div key="field" className="duel-slot duel-slot--special" data-label="Field">
                {s.field && <BoardCard {...cardProps(s.field, who)} />}
            </div>
        );
        const gy = <Pile key="gy" label="GY" top={s.gy[s.gy.length - 1]} count={s.gy.length} onTap={() => tapPile(who)} duel={duel} who={who} />;
        const deck = <Pile key="deck" label="Deck" back count={s.deck} />;
        const extra = <Pile key="extra" label="Extra" back count={s.extra} />;
        const monsterRow = mirror ? [gy, ...row(monsters, who, "m"), fieldSlot] : [fieldSlot, ...row(monsters, who, "m"), gy];
        const spellRow = mirror ? [deck, ...row(spells, who, "s"), extra] : [extra, ...row(spells, who, "s"), deck];
        return (
            <div className={`duel-mat duel-mat--${who}`}>
                {mirror ? <>{spellRow}{monsterRow}</> : <>{monsterRow}{spellRow}</>}
            </div>
        );
    };

    return (
        <LayoutGroup>
            <div className="duel">
                <div className="duel-opp-hand" aria-label={`Rival's hand: ${duel.opp.hand.length} cards`}>
                    {duel.opp.hand.map((c) => <img key={c.uid} src={BACK} alt="" className="duel-opp-hand__card" />)}
                </div>
                <Info side={duel.opp} who="opp" duel={duel} />
                {side("opp")}

                <div className="duel-mid">
                    <span className="duel-turn">Turn {duel.turn}</span>
                    <div className="duel-phases" role="tablist" aria-label="Phase">
                        {PHASES.map((p) => (
                            <button key={p} type="button" role="tab" aria-selected={duel.phase === p} aria-label={PHASE_NAME[p]}
                                className={`duel-phase ${duel.phase === p ? "is-on" : ""} ${PHASES.indexOf(p) < PHASES.indexOf(duel.phase) ? "is-past" : ""}`}
                                onClick={() => tapPhase(p)}>{p}</button>
                        ))}
                    </div>
                    <button type="button" className="duel-reset" onClick={reset} aria-label="Start over">↺</button>
                </div>

                {side("me")}
                <Info side={duel.me} who="me" duel={duel} />

                <div className="duel-hand">
                    {duel.me.hand.map((c, i, all) => {
                        const mid = (all.length - 1) / 2;
                        return (
                            <motion.button key={c.uid} layoutId={c.uid} type="button" data-uid={c.uid} className="duel-hand__card"
                                style={{ rotate: (i - mid) * 4, y: Math.abs(i - mid) * 5, marginInline: all.length > 4 ? "calc(var(--cw) * -0.22)" : "2px" }}
                                onClick={() => tapCard(c.uid)} aria-label={infoOf(c.id).name}>
                                <img src={face(c.id)} alt="" draggable={false} />
                            </motion.button>
                        );
                    })}
                </div>

                {duel.chain.length > 0 && (
                    <div className="duel-chain" aria-label="Chain">
                        {duel.chain.map((l, i) => (
                            <div key={l.uid} className={`duel-chain__link duel-chain__link--${l.owner}`}>
                                <img src={face(l.id)} alt={infoOf(l.id).name} />
                                <b>{i + 1}</b>
                            </div>
                        ))}
                    </div>
                )}

                <AnimatePresence>
                    {duel.banner && (
                        <motion.div key={duel.banner.key} className={`duel-banner duel-banner--${duel.banner.owner}`}
                            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }}
                            transition={{ type: "spring", stiffness: 380, damping: 26 }}>
                            <img src={face(duel.banner.id)} alt="" />
                            <div><h3>{duel.banner.title}</h3><p>{duel.banner.sub}</p></div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {prompt && (
                        <motion.div key={prompt.kind + prompt.title} className={`duel-sheet stone-panel duel-sheet--${prompt.kind}`}
                            initial={{ y: "110%" }} animate={{ y: 0 }} exit={{ y: "110%" }} transition={{ type: "spring", stiffness: 420, damping: 38 }}>
                            <div className="duel-sheet__grip" />
                            <h2 className="duel-sheet__title">{prompt.title}</h2>
                            {"text" in prompt && prompt.text && <p className="duel-sheet__text">{prompt.text}</p>}
                            {prompt.kind === "menu" && (
                                <div className="duel-sheet__options">
                                    {prompt.options.map((o) => (
                                        <button key={o.value} type="button" className="duel-opt" disabled={o.disabled} onClick={() => reply(o.value)}>
                                            {o.label}{o.note && <small>{o.note}</small>}
                                        </button>
                                    ))}
                                    {prompt.cancel && <button type="button" className="duel-opt duel-opt--quiet" onClick={() => reply(null)}>Cancel</button>}
                                </div>
                            )}
                            {prompt.kind === "board" && (
                                <div className="duel-sheet__pickbar">
                                    <span>{prompt.picked.length} / {prompt.count} chosen · tap the glowing cards</span>
                                    {prompt.cancel && <button type="button" className="duel-opt duel-opt--quiet" onClick={() => reply(null)}>Cancel</button>}
                                </div>
                            )}
                            {prompt.kind === "list" && (
                                <>
                                    <div className="duel-sheet__list">
                                        {prompt.cards.map((c) => (
                                            <button key={c.uid} type="button" className="duel-listcard" onClick={() => reply(c.uid)}>
                                                <img src={face(c.id)} alt="" />
                                                <span>{infoOf(c.id).name}</span>
                                            </button>
                                        ))}
                                    </div>
                                    {prompt.browse && <button type="button" className="duel-opt duel-opt--quiet" onClick={() => reply(null)}>Close</button>}
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            {closeUp && <CardCloseUp card={closeUp} onClose={() => setCloseUp(null)} />}
        </LayoutGroup>
    );
}

function Info({ side, who, duel }: { side: Side; who: Who; duel: Duel }) {
    return (
        <div className={`duel-info duel-info--${who}`}>
            <span className="duel-info__name">{side.name}</span>
            <span className="duel-info__hand">{who === "opp" ? `${side.hand.length} in hand` : `${side.deck} in deck`}</span>
            <span className="duel-info__lp">
                <small>LP</small> <LifePoints value={side.lp} />
                {duel.floats.filter((f) => f.lp === who).map((f) => <span key={f.key} className={`duel-float duel-float--${f.tone}`}>{f.text}</span>)}
            </span>
        </div>
    );
}

/** Life points that count down to their new value rather than jump. */
function LifePoints({ value }: { value: number }) {
    const [shown, setShown] = useState(value);
    const from = useRef(value);
    useEffect(() => {
        const start = performance.now(), a = from.current;
        let raf = 0;
        const tick = (t: number) => {
            const k = Math.min(1, (t - start) / 650);
            setShown(Math.round(a + (value - a) * (1 - (1 - k) ** 3)));
            if (k < 1) raf = requestAnimationFrame(tick);
            else from.current = value;
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [value]);
    return <b className={shown !== value ? "is-ticking" : ""}>{shown}</b>;
}

function BoardCard({ c, who, duel, candidate, picked, onTap }: {
    c: Inst; who: Who; duel: Duel; candidate: boolean; picked: boolean; onTap: () => void;
}) {
    const info = infoOf(c.id);
    const up = c.face === "up";
    const s = info.kind === "monster" && up ? statsOf(duel, c) : null;
    const destroying = duel.destroying.includes(c.uid);
    return (
        <motion.button layoutId={c.uid} type="button" data-uid={c.uid}
            className={`duel-card ${candidate ? "is-candidate" : ""} ${picked ? "is-picked" : ""} ${destroying ? "is-destroying" : ""}`}
            onClick={onTap} aria-label={up || who === "me" ? `${info.name}${up ? "" : " (set)"}` : "Set card"}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}>
            <span className="duel-card__lunge">
                <span className={`duel-card__turn ${c.pos === "def" ? "is-def" : ""}`}>
                    <img src={up ? face(c.id) : BACK} alt="" draggable={false} />
                    {!up && who === "me" && <i className="duel-card__peek">set</i>}
                </span>
                {s && (
                    <span className={`duel-card__stat ${c.pos === "def" ? "is-def" : ""}`}>
                        <b className={c.pos === "atk" ? (s.atkDelta > 0 ? "is-up" : s.atkDelta < 0 ? "is-down" : "") : (s.defDelta > 0 ? "is-up" : s.defDelta < 0 ? "is-down" : "")}>
                            {c.pos === "atk" ? s.atk : s.def}
                        </b>
                    </span>
                )}
            </span>
            {duel.floats.filter((f) => f.uid === c.uid).map((f) => <span key={f.key} className={`duel-float duel-float--${f.tone}`}>{f.text}</span>)}
        </motion.button>
    );
}

function Pile({ label, top, count, back, onTap, duel, who }: {
    label: string; top?: Inst; count: number; back?: boolean; onTap?: () => void; duel?: Duel; who?: Who;
}) {
    return (
        <button type="button" className="duel-slot duel-slot--special duel-pile" data-label={label} onClick={onTap} disabled={!onTap}
            aria-label={`${label}: ${count} card${count === 1 ? "" : "s"}`}>
            {back && count > 0 && <img className="duel-pile__back" src={BACK} alt="" />}
            {top && duel && who && (
                <motion.span layoutId={top.uid} className="duel-pile__top" data-uid={top.uid} transition={{ type: "spring", stiffness: 300, damping: 30 }}>
                    <img src={face(top.id)} alt="" />
                </motion.span>
            )}
            {count > 0 && <span className="duel-pile__count">{count}</span>}
        </button>
    );
}
