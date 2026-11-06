"use client";

import Link from "next/link";
import type { CardSet, PulledCard } from "@/lib/api";
import CartoucheButton from "@/components/ui/CartoucheButton";
import CardGallery, { byTier, type GalleryItem } from "@/components/card/CardGallery";
import { TIER_LABEL, toStageCard } from "@/components/packs/stage/plate";
import { useEffect } from "react";
import { cardTip, haulLines } from "@/lib/guide/lines";
import { guide, seed } from "@/lib/guide/store";

/**
 * The haul, once every pack is open: the set, how many packs and cards, the best
 * pulls counted by rarity, then every card under its rarity band. Done & Save
 * keeps them; Open More (guests) and Reroll (a Redoer Ticket) stay where they were.
 */
export default function OpeningSummary({
    set,
    cards,
    packCount,
    ownedCount,
    onSave,
    onBack,
    onOpenMore,
    onReroll,
    saveLabel = "Done & Save",
    backLabel = "Back to the campaign",
    stage,
    alreadySaid,
}: {
    set: CardSet;
    cards: PulledCard[];
    packCount: number;
    /** How many of a card the player had before this opening. */
    ownedCount: (id: number) => number;
    onSave: () => void;
    onBack: () => void;
    onOpenMore?: () => void;
    onReroll?: () => void;
    saveLabel?: string;
    backLabel?: string;
    /** The player's stage in the series, for Yugi's word on the haul (left out: he stays quiet). */
    stage?: number;
    /** Cards Yugi already talked about as they flipped. */
    alreadySaid?: ReadonlySet<number>;
}) {
    // The haul is in: Yugi on the best of it, or a word of comfort.
    useEffect(() => {
        if (stage === undefined || !cards.length) return;
        const pulled = new Map<number, number>();
        for (const c of cards) pulled.set(c.id, (pulled.get(c.id) ?? 0) + 1);
        const haul = cards.map((c) => ({ id: c.id, name: c.name, rarity: c.pulled_rarity, isNew: ownedCount(c.id) === 0, copies: ownedCount(c.id) + (pulled.get(c.id) ?? 0) }));
        const t = setTimeout(() => guide.sayAll(haulLines(haul, stage, seed(), alreadySaid)), 900);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per haul
    }, [cards.length, stage]);
    // One tile per card and printed rarity, counting duplicates.
    const tiles = new Map<string, GalleryItem>();
    for (const c of cards) {
        const key = `${c.id}-${c.pulled_rarity}`;
        const t = tiles.get(key);
        if (t) t.count++;
        else tiles.set(key, { key, card: toStageCard(c, ownedCount(c.id)), count: 1, isNew: ownedCount(c.id) === 0 });
    }
    const items = [...tiles.values()].sort((a, b) => a.card.card.name.localeCompare(b.card.card.name));
    const newCount = new Set(items.filter((i) => i.isNew).map((i) => i.card.card.id)).size;
    const hits = byTier(items).filter((s) => s.tier !== "Common");

    return (
        <div className="haul">
            <header className="haul__head">
                <p className="store__stage">Your haul</p>
                <h1>{set.set_name}</h1>
                <p className="store__meta">
                    {packCount} {packCount === 1 ? "pack" : "packs"} · {cards.length} cards · {newCount} new
                </p>
                {hits.length > 0 && (
                    <ul className="haul__hits" aria-label="Best pulls">
                        {hits.map((s) => (
                            <li key={s.tier} data-tier={s.tier}>
                                <b>{s.items.reduce((n, i) => n + i.count, 0)}</b> {TIER_LABEL[s.tier]}
                            </li>
                        ))}
                    </ul>
                )}
            </header>

            <CardGallery items={items} onLook={stage === undefined ? undefined : (c) => guide.say(cardTip(c, stage, seed()))} />

            <nav className="haul__dock" aria-label="Finish opening">
                <CartoucheButton onClick={onSave} next className="haul__btn">{saveLabel}</CartoucheButton>
                {onOpenMore && <CartoucheButton onClick={onOpenMore} className="haul__btn">Open More</CartoucheButton>}
                {onReroll && <CartoucheButton onClick={onReroll} className="haul__btn">Reroll</CartoucheButton>}
                <Link href="/timeline" onClick={(e) => (e.preventDefault(), onBack())} className="haul__back">{backLabel}</Link>
            </nav>
        </div>
    );
}
