"use client";

import { useEffect, useState } from "react";
import { searchCardsByName, type Card } from "@/lib/api";
import { cardImage } from "./parts";

/*
 * "Declare a card name" (Question, Mind Crush, Prohibition): type a few letters and pick the card
 * from the matches, so the name is always a real card's. `only` keeps the list to the kind of card
 * the effect asks for. If the search can't be reached, the exact name can still be typed.
 */

const KIND: Record<"monster" | "spell" | "trap", string> = { monster: "Monster", spell: "Spell", trap: "Trap" };

export function NameDeclare({ only, disabled, onDeclare }: { only?: "monster" | "spell" | "trap"; disabled?: boolean; onDeclare: (name: string, code?: number) => void }) {
    const [text, setText] = useState("");
    const [matches, setMatches] = useState<Card[] | null>(null);
    const [picked, setPicked] = useState<Card | null>(null);
    const query = text.trim();

    useEffect(() => {
        if (query.length < 2) return;
        let stale = false;
        // A pause in the typing, then the search.
        const t = setTimeout(() => {
            searchCardsByName(query).then((found) => {
                if (stale) return;
                const q = query.toLowerCase();
                const fits = found.filter((c) => !only || c.type.includes(KIND[only]));
                // Names that start with what was typed first, then the shorter names.
                fits.sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || a.name.length - b.name.length);
                setMatches(fits.slice(0, 12));
            });
        }, 250);
        return () => {
            stale = true;
            clearTimeout(t);
        };
    }, [query, only]);

    const shown = query.length < 2 ? [] : (matches ?? []);
    // The card to declare: the one picked, or the one match whose name is exactly what was typed.
    const exact = picked ?? shown.find((c) => c.name.toLowerCase() === query.toLowerCase()) ?? null;
    // With matches on screen the choice is among them; with none (or no search), the typed name goes as it is.
    const ready = !!query && (!!exact || !shown.length);
    const declare = () => {
        if (!ready || disabled) return;
        onDeclare(exact ? exact.name : query, exact?.id);
    };

    return (
        <form className="df-sheet__form" onSubmit={(e) => (e.preventDefault(), declare())}>
            <input
                className="df-input" value={text} autoFocus aria-label="Card name"
                placeholder={only ? `A ${KIND[only]}'s name: type a few letters` : "Type a few letters of the name"}
                onChange={(e) => {
                    setText(e.target.value);
                    setPicked(null);
                }}
            />
            {shown.length > 0 && (
                <div className="df-sheet__list" onPointerDown={(e) => e.stopPropagation() /* scrolls; doesn't drag the sheet */}>
                    {shown.map((c) => (
                        <button key={c.id} type="button" className={`df-listcard ${exact?.id === c.id ? "is-picked" : ""}`}
                            onClick={() => {
                                setPicked(c);
                                setText(c.name);
                            }}>
                            <img src={cardImage(c.id)} alt="" />
                            <span>{c.name}</span>
                        </button>
                    ))}
                </div>
            )}
            {query.length >= 2 && matches !== null && !shown.length && <p className="df-sheet__text">No {only ? `${KIND[only]} ` : ""}card found by that name. Check the spelling.</p>}
            <button type="submit" className="df-opt" disabled={!ready || disabled}>
                <span>{exact ? `Declare ${exact.name}` : "Declare"}</span>
            </button>
        </form>
    );
}
