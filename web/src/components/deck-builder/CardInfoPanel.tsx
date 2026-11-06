"use client";

import { Card } from "@/lib/api";
import { useMemo } from "react";
import { CardPlate } from "@/components/card/CardPlate";
import { MarkToggle, useLookedAt } from "@/components/card/LookLater";
import { stageOf, type Printing } from "./stage";

interface CardInfoPanelProps {
    card: Card | null;
    /** How many of the card you own. */
    owned?: number;
    /** The printing you own (its set code and rarity). */
    printing?: Printing;
}

/**
 * The hovered card, read in full: its art, then its details as the card-styled
 * plate. A long effect scrolls inside the plate's text box, not the panel.
 */
export default function CardInfoPanel({ card, owned = 0, printing }: CardInfoPanelProps) {
    const stage = useMemo(() => card && stageOf(card, printing, owned), [card, printing, owned]);
    useLookedAt(card?.id, 1200);
    if (!card || !stage) {
        return (
            <div className="db-info">
                <div className="db-info__none">Hover a card to read it here.<br />Double-click to add · right-click to remove · drag between decks</div>
            </div>
        );
    }
    return (
        <div className="db-info">
            <img className="db-info__art" src={card.card_images[0]?.image_url} alt={card.name} />
            <CardPlate card={stage} className="db-info__plate" />
            <MarkToggle cardId={card.id} className="db-info__mark" />
        </div>
    );
}
