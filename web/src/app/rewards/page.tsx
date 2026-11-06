"use client";

import { alertRepoError, useProgression } from "@/context/ProgressionContext";
import { useAuth } from "@/context/AuthContext";
import { fetchAllSets, fetchCardsByIds, type Card, type CardSet } from "@/lib/api";
import { ownedCountsById } from "@/lib/collection";
import type { Opening } from "@/lib/repo/types";
import { useRouter } from "next/navigation";
import { RewardEntry, RivalReward, resolvePrizeKind, claimedCardId, getPrize, type PrizeId } from "@/lib/rewards";
import { useEffect, useMemo, useRef, useState } from "react";
import GuideSprite from "@/components/layout/GuideSprite";
import CartoucheButton from "@/components/ui/CartoucheButton";
import { CardCloseUp } from "@/components/card/CardPlate";
import { printedIn } from "@/components/packs/stage/plate";
import PackRevealModal from "@/components/rewards/PackRevealModal";
import WildcardModal from "@/components/rewards/WildcardModal";
import StarlightSearchModal from "@/components/rewards/StarlightSearchModal";
import BanInput from "@/components/rewards/BanInput";
import SnatchModal from "@/components/rewards/SnatchModal";
import { prizeDoes } from "@/components/rewards/relics";
import Relic from "@/components/rewards/Relic";
import "@/components/rewards/rewards.css";

/**
 * The REWARDS tab (route: /rewards) — the persisted reward ledger, as an altar.
 *
 * WAITING puts one unclaimed reward at a time on the altar (arrows, a swipe, or
 * the row of relics below pick another), with the claim for its prize kind.
 * THE CHRONICLE is a scroll of what's been claimed: yours, and in a duo your
 * rival's (read-only; what they still hold stays theirs). Every reward names the
 * set whose match it came from: a win's wheel, or the loss a pity reward is for.
 *
 * Rewards are created by the record-match flow (win → the spun wheel prize;
 * loss → the pity prize) and resolved here:
 *  - pity        → the shared `PackRevealModal`, opening 3 boosters of the
 *                  just-finished CORE set
 *  - tournament  → the same `PackRevealModal`, opening 3 packs of the latest
 *                  tournament set released before the won pack
 *  - wildcard    → the `WildcardModal`: pick any card of the reward's rarity or
 *                  below from the won pack.
 *  - ban / unban → the `BanInput` typeahead (the deck builder reads
 *                  `bannedCardIds` and blocks/greys the add).
 *  - starlight   → the `StarlightSearchModal`: a full-catalog typeahead gated to
 *                  cards released before the won pack, granted at Starlight Rare.
 *  - snatch      → the `SnatchModal`: copy a card from the rival's binder, who
 *                  keeps theirs (duo series only; solo wheels leave it off).
 *  - spin        → the wheel on the record-match screen.
 *  - redoer      → not claimed here: spent from the pack summary.
 */

const REDOER_NOTE = "Spend it from the pack summary to reroll an opening";
/** How long a relic plays its opening before the reward's own flow takes over. */
const OPENING_MS = 650;

const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

/** A claimed reward on the scroll, yours or your rival's. */
type Line = { key: string; prizeId: PrizeId; from: string; setIndex: number; on?: string; cardId: number | null; packCards?: number; rival: boolean };

export default function RewardsPage() {
    const { rewards, bannedCardIds, hasLoaded, claimReward, rivalBinder, rivalRewards, activeOpening, flip, saveOpening, series, collection } = useProgression();
    const me = useAuth().user;
    /** The reward whose rival-binder picker is open, if any. */
    const [snatchEntry, setSnatchEntry] = useState<RewardEntry | null>(null);
    const router = useRouter();
    /** The pity or tournament packs being opened, if any. */
    const [revealOpening, setRevealOpening] = useState<Opening | null>(null);
    /** The reward whose wildcard card-picker modal is open, if any. */
    const [wildcardEntry, setWildcardEntry] = useState<RewardEntry | null>(null);
    /** The reward whose starlight full-catalog search modal is open, if any. */
    const [starlightEntry, setStarlightEntry] = useState<RewardEntry | null>(null);
    /** The reward whose ban/unban typeahead is open, if any. */
    const [banEntry, setBanEntry] = useState<RewardEntry | null>(null);
    /** A claimed reward's card, in the close-up. */
    const [inspect, setInspect] = useState<{ card: Card; line: Line } | null>(null);

    const [tab, setTab] = useState<"waiting" | "chronicle">("waiting");
    const [at, setAt] = useState(0);
    /** The reward whose relic is playing its opening. */
    const [opening, setOpening] = useState<string | null>(null);

    const available = useMemo(() => rewards.filter((r) => r.status === "available"), [rewards]);
    const claimed = useMemo(() => rewards.filter((r) => r.status === "claimed"), [rewards]);
    const current = available[Math.min(at, available.length - 1)];
    const canClaim = (r: RewardEntry) => resolvePrizeKind(r.prizeId) !== "redoer";

    // The rival's claimed rewards (duo only).
    const duo = series?.mode === "duo";
    const rivalName = series?.members.find((m) => m.id !== me?.id)?.duelistName ?? "Rival";
    const [rivals, setRivals] = useState<RivalReward[]>([]);
    useEffect(() => {
        if (!hasLoaded || !duo) return;
        let cancelled = false;
        rivalRewards().then((r) => !cancelled && setRivals(r)).catch(() => undefined);
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per series
    }, [hasLoaded, duo, series?.id]);

    // The sets, for each reward's pack art.
    const [sets, setSets] = useState<CardSet[]>([]);
    useEffect(() => {
        fetchAllSets().then(setSets).catch(() => undefined);
    }, []);
    const setArt = (name: string) => sets.find((s) => s.set_name === name)?.set_image;
    const setCode = (name: string) => sets.find((s) => s.set_name === name)?.set_code ?? "";

    // Both players' claims, newest first.
    const lines = useMemo(() => {
        const mine: Line[] = claimed.map((e) => ({
            key: e.id, prizeId: e.prizeId, from: e.wonFromPackName, setIndex: e.wonFromSetIndex, on: e.claimedDate,
            cardId: claimedCardId(e), packCards: e.grantedCardIds?.length, rival: false,
        }));
        const theirs: Line[] = rivals.map((r) => ({
            key: "rival-" + r.id, prizeId: r.prizeId, from: r.wonFromPackName, setIndex: r.wonFromSetIndex, on: r.claimedDate,
            cardId: r.cardId ?? null, packCards: r.packCards, rival: true,
        }));
        const newest = (a: Line, b: Line) => (b.on ?? "").localeCompare(a.on ?? "");
        return { mine: mine.sort(newest), theirs: theirs.sort(newest) };
    }, [claimed, rivals]);

    // Resolve each claimed single-pick reward's card (wildcard/ban/snatch, either
    // player's) so the scroll can show it. Pack rewards have no single pick.
    const cardIds = useMemo(
        () => Array.from(new Set([...lines.mine, ...lines.theirs].map((l) => l.cardId).filter((id): id is number => id != null))),
        [lines],
    );
    const [pickedCards, setPickedCards] = useState<Record<number, Card>>({});
    useEffect(() => {
        const missing = cardIds.filter((id) => !pickedCards[id]);
        if (missing.length === 0) return;
        let cancelled = false;
        fetchCardsByIds(missing).then((cards) => {
            if (cancelled || cards.length === 0) return;
            setPickedCards((prev) => {
                const next = { ...prev };
                for (const c of cards) next[c.id] = c;
                return next;
            });
        });
        return () => {
            cancelled = true;
        };
    }, [cardIds, pickedCards]);

    // A reload mid-reveal comes back to the same packs.
    useEffect(() => {
        if (!hasLoaded) return;
        activeOpening("reward").then((o) => o && setRevealOpening(o)).catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once after loading
    }, [hasLoaded]);

    /** Claims `entry` (with a picked card for single-card prizes) and closes its modal. */
    const claim = async (entry: RewardEntry, cardId: number | undefined, close: () => void, printing?: string) => {
        try {
            const opened = await claimReward(entry.id, cardId, printing);
            close();
            if (opened) setRevealOpening(opened);
        } catch (error) {
            alertRepoError(error);
        }
    };

    const collectReveal = async () => {
        if (!revealOpening) return;
        try {
            await saveOpening(revealOpening.id);
            setRevealOpening(null);
        } catch (error) {
            alertRepoError(error);
        }
    };

    // The claim for an available entry, by prize kind; null = not claimed here.
    const claimAction = (entry: RewardEntry): { label: string; onClick: () => void } | null => {
        const kind = resolvePrizeKind(entry.prizeId);
        switch (kind) {
            case "pity":
            case "tournament":
                return { label: "Open 3 Packs", onClick: () => claim(entry, undefined, () => undefined) };
            case "wildcard":
                return { label: "Choose Card", onClick: () => setWildcardEntry(entry) };
            case "starlight":
                return { label: "Search Card", onClick: () => setStarlightEntry(entry) };
            case "ban":
            case "unban":
                return { label: kind === "ban" ? "Ban a Card" : "Unban a Card", onClick: () => setBanEntry(entry) };
            case "spin":
                return { label: "Spin the Wheel", onClick: () => router.push(`/record-match?spin=${entry.id}`) };
            case "snatch":
                return { label: "Steal a Card", onClick: () => setSnatchEntry(entry) };
            case "redoer":
                return null;
        }
    };

    // The relic opens (lid, seal, spin), then the reward's flow takes over.
    const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(openTimer.current), []);
    const start = (entry: RewardEntry, run: () => void) => {
        if (opening) return;
        setOpening(entry.id);
        openTimer.current = setTimeout(() => {
            setOpening(null);
            run();
        }, OPENING_MS);
    };

    const go = (to: number) => setAt(Math.max(0, Math.min(available.length - 1, to)));
    const swipe = useRef<number | null>(null);

    /** Which set's wheel a reward came from, or the loss a pity reward was for. */
    const origin = (prizeId: PrizeId, from: string) => {
        const art = setArt(from);
        return (
            <span className="rw-origin">
                {art && <img src={art} alt="" />}
                {resolvePrizeKind(prizeId) === "pity" ? `Pity for losing ${from}` : `Won on the ${from} wheel`}
            </span>
        );
    };

    const caption = (l: Line) => {
        switch (resolvePrizeKind(l.prizeId)) {
            case "ban": return "banned";
            case "unban": return "unbanned";
            case "snatch": return l.rival ? "copied from your binder" : `copied from ${rivalName}'s binder`;
            default: return "picked";
        }
    };

    /** Whose pick a card was, for the close-up. */
    const pickNote = (l: Line) => {
        const who = l.rival ? rivalName : "you";
        switch (resolvePrizeKind(l.prizeId)) {
            case "ban": return `Banned by ${who}`;
            case "unban": return `Unbanned by ${who}`;
            case "snatch": return l.rival ? `${rivalName} copied it from your binder` : `Copied from ${rivalName}'s binder`;
            case "starlight": return l.rival ? `${rivalName}'s Starlight pick` : "Your Starlight pick";
            default: return l.rival ? `${rivalName}'s wildcard pick` : "Your wildcard pick";
        }
    };

    const entry = (l: Line) => {
        const card = l.cardId != null ? pickedCards[l.cardId] : undefined;
        const label = getPrize(l.prizeId)?.label ?? l.prizeId;
        const banned = resolvePrizeKind(l.prizeId) === "ban";
        return (
            <div key={l.key} className={`rw-entry ${l.rival ? "rw-entry--rival" : ""}`}>
                {card ? (
                    <button type="button" className={`rw-thumb ${banned ? "rw-thumb--banned" : ""}`} onClick={() => setInspect({ card, line: l })} aria-label={`View ${card.name}`}>
                        <img src={card.card_images[0]?.image_url_small ?? card.card_images[0]?.image_url} alt="" />
                    </button>
                ) : (
                    <span className="rw-medal"><Relic prizeId={l.prizeId} /></span>
                )}
                <span className="rw-text">
                    <b>{label}</b>
                    <small>
                        {card ? `${card.name}, ${caption(l)}` : l.packCards ? `opened ${l.packCards} cards` : l.cardId != null ? "…" : ""}
                        {l.on ? ` · ${shortDate(l.on)}` : ""}
                    </small>
                    <small>{origin(l.prizeId, l.from)}</small>
                </span>
                <span className="rw-stamp">{l.rival ? rivalName : "Claimed"}</span>
            </div>
        );
    };

    const waitingCount = available.filter(canClaim).length;
    const action = current ? claimAction(current) : null;

    return (
        <div className="h-full overflow-hidden grid grid-rows-[1fr] relative">
            <div className="min-h-0 overflow-y-auto custom-scrollbar">
                <div className="rw">
                    <header className="rw-head">
                        <p className="rw-kicker">{tab === "waiting" ? `The altar · ${waitingCount} waiting` : "The chronicle"}</p>
                        <h1>Rewards</h1>
                    </header>
                    <div className="rw-tabs" role="tablist" aria-label="Rewards">
                        <button role="tab" aria-selected={tab === "waiting"} onClick={() => setTab("waiting")}>Waiting · {available.length}</button>
                        <button role="tab" aria-selected={tab === "chronicle"} onClick={() => setTab("chronicle")}>Chronicle · {lines.mine.length + lines.theirs.length}</button>
                    </div>

                    {tab === "waiting" ? (
                        current ? (
                            <>
                                <div
                                    className="rw-stage"
                                    onPointerDown={(e) => (swipe.current = e.clientX)}
                                    onPointerUp={(e) => {
                                        if (swipe.current == null) return;
                                        const dx = e.clientX - swipe.current;
                                        swipe.current = null;
                                        if (Math.abs(dx) > 50) go(at + (dx < 0 ? 1 : -1));
                                    }}
                                >
                                    <div className="rw-pool" aria-hidden="true" />
                                    <button type="button" className="rw-arrow" onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous reward">‹</button>
                                    <div className="rw-altar">
                                        <div key={current.id} className={`rw-holder rw-holder--in ${canClaim(current) ? "" : "rw-holder--locked"} ${opening === current.id ? "rw-opening" : ""}`}>
                                            <Relic prizeId={current.prizeId} locked={!canClaim(current)} />
                                            {opening === current.id && <span className="rw-burst" />}
                                        </div>
                                        <div className="rw-slab" aria-hidden="true" />
                                    </div>
                                    <button type="button" className="rw-arrow" onClick={() => go(at + 1)} disabled={at >= available.length - 1} aria-label="Next reward">›</button>
                                </div>
                                <div className="rw-info">
                                    <h2>{getPrize(current.prizeId)?.label ?? current.prizeId}</h2>
                                    <p>{prizeDoes(current.prizeId, REDOER_NOTE)}</p>
                                    <p className="rw-when">{origin(current.prizeId, current.wonFromPackName)} · {shortDate(current.wonDate)}</p>
                                    {action ? (
                                        <div className="rw-act">
                                            <CartoucheButton next onClick={() => start(current, action.onClick)}>{action.label}</CartoucheButton>
                                        </div>
                                    ) : (
                                        <p className="rw-locked">Not claimed here</p>
                                    )}
                                </div>
                                {available.length > 1 && (
                                    <div className="rw-queue" aria-label="Waiting rewards">
                                        {available.map((r, i) => (
                                            <button
                                                key={r.id}
                                                type="button"
                                                onClick={() => go(i)}
                                                className={canClaim(r) ? "" : "is-locked"}
                                                aria-current={r.id === current.id}
                                                aria-label={getPrize(r.prizeId)?.label ?? r.prizeId}
                                                title={getPrize(r.prizeId)?.label}
                                            >
                                                <Relic prizeId={r.prizeId} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <p className="rw-empty">No rewards waiting. Win or lose a match to earn some.</p>
                        )
                    ) : (
                        <section className="rw-scroll" aria-label="The chronicle">
                            <h2>Spoils of the Road</h2>
                            <p className="rw-sub">Every reward claimed{duo ? `, by you and by ${rivalName}` : ""}</p>
                            <div className="rw-sec">Your spoils</div>
                            {lines.mine.length ? lines.mine.map(entry) : <p className="rw-none">Nothing claimed yet.</p>}
                            {duo && (
                                <>
                                    <div className="rw-sec">{rivalName}&apos;s spoils</div>
                                    {lines.theirs.length ? lines.theirs.map(entry) : <p className="rw-none">{rivalName} hasn&apos;t claimed anything yet.</p>}
                                </>
                            )}
                        </section>
                    )}
                </div>
            </div>

            <GuideSprite />

            {revealOpening && (
                <PackRevealModal
                    opening={revealOpening}
                    onFlip={(flipped) => void flip(revealOpening.id, flipped).catch(() => undefined)}
                    onCollect={collectReveal}
                    onClose={() => setRevealOpening(null)}
                />
            )}

            {wildcardEntry && (
                <WildcardModal
                    entry={wildcardEntry}
                    onChoose={(card) => claim(wildcardEntry, card.id, () => setWildcardEntry(null))}
                    onClose={() => setWildcardEntry(null)}
                />
            )}

            {starlightEntry && (
                <StarlightSearchModal
                    entry={starlightEntry}
                    onChoose={(card) => claim(starlightEntry, card.id, () => setStarlightEntry(null))}
                    onClose={() => setStarlightEntry(null)}
                />
            )}

            {banEntry && (
                <BanInput
                    mode={resolvePrizeKind(banEntry.prizeId) === "unban" ? "unban" : "ban"}
                    bannedCardIds={bannedCardIds}
                    onPick={(card) => claim(banEntry, card.id, () => setBanEntry(null))}
                    onClose={() => setBanEntry(null)}
                    wonFrom={banEntry.wonFromPackName}
                />
            )}

            {snatchEntry && (
                <SnatchModal
                    loadBinder={rivalBinder}
                    onChoose={(printing) => claim(snatchEntry, undefined, () => setSnatchEntry(null), printing)}
                    onClose={() => setSnatchEntry(null)}
                    rivalName={rivalName}
                    wonFrom={snatchEntry.wonFromPackName}
                />
            )}

            {inspect && (
                <CardCloseUp
                    card={printedIn(
                        inspect.card,
                        setCode(inspect.line.from),
                        ownedCountsById(collection).get(inspect.card.id) ?? 0,
                        pickNote(inspect.line),
                    )}
                    onClose={() => setInspect(null)}
                />
            )}
        </div>
    );
}
