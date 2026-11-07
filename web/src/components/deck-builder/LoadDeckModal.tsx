"use client";

import { useEffect } from "react";
import { SavedDeck } from "@/context/ProgressionContext";
import "@/components/ui/game-dialog.css";

interface LoadDeckModalProps {
    savedDecks: SavedDeck[];
    onLoad: (deck: SavedDeck) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}

/** Pick a saved deck: the game's lacquer tablet (see GameDialog) with the decks as slabs inside it. */
export default function LoadDeckModal({ savedDecks, onLoad, onDelete, onClose }: LoadDeckModalProps) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.stopImmediatePropagation();
            onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const decks = [...savedDecks].sort((a, b) => b.createdAt - a.createdAt);
    return (
        <div className="gd ld" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className="gd__tablet ld__tablet" role="dialog" aria-modal="true" aria-labelledby="ld-title">
                <span className="gd__eye" aria-hidden="true" />
                <h2 id="ld-title" className="gd__title">Load a deck</h2>
                <div className="ld__list">
                    {decks.length === 0 && <p className="ld__none">No saved decks yet. Build one and save it.</p>}
                    {decks.map((deck) => {
                        const short = deck.mainDeck.length < 40;
                        return (
                            <div key={deck.id} className="ld__row">
                                <button type="button" className="ld__pick" onClick={() => onLoad(deck)}>
                                    <b className={short ? "ld__name ld__name--short" : "ld__name"}>{deck.name}</b>
                                    <span>
                                        {new Date(deck.createdAt).toLocaleDateString()} · {deck.mainDeck.length} cards{short ? " · under 40" : ""}
                                    </span>
                                </button>
                                <button type="button" className="ld__del" onClick={() => onDelete(deck.id)} aria-label={`Delete ${deck.name}`}>
                                    Delete
                                </button>
                            </div>
                        );
                    })}
                </div>
                <div className="gd__buttons">
                    <button type="button" className="gd__btn gd__btn--quiet" onClick={onClose}>
                        <span className="gd__btn-words">Cancel</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
