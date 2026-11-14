"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BOT_LEVELS, DUELISTS, duelistById, duelistDeck, type BotLevel, type Duelist } from "@ygo/shared";
import { asset } from "@/lib/utils";
import { BotGlyph } from "./DuelGlyphs";
import "./opponent-picker.css";

/**
 * Who to practice against, in the manner of chess.com's bots: the duelists from the anime, weakest
 * to strongest, each with their sprite, a rating and their deck in an era of the show; or the
 * practice bot, which plays your own deck at the level you pick.
 */
export type Opponent = { kind: "bot"; level: BotLevel } | { kind: "duelist"; id: string; era: string };

export const LEVEL_NAMES: Record<BotLevel, string> = {
    easy: "Easy",
    normal: "Normal",
    hard: "Hard",
};
const GROUPS: { level: BotLevel; title: string }[] = [
    { level: "easy", title: "Beginner" },
    { level: "normal", title: "Intermediate" },
    { level: "hard", title: "Advanced" },
];
/** Where a sprite's face is across (most are centred). */
const FACE_X: Record<string, string> = { mai: "58%" };

export const sprite = (d: Duelist) => asset(`/sprites/${d.sprite}.webp`);
const firstName = (d: Duelist) => (d.id === "pegasus" ? "Pegasus" : d.name.split(" ")[0]!);

/** The opponent as a duelist, if it is one (and still on the roster). */
export function duelistOf(o: Opponent): Duelist | undefined {
    return o.kind === "duelist" ? duelistById(o.id) : undefined;
}

/** Who you'd be dueling, by name, for the button. */
export const opponentName = (o: Opponent) => {
    const d = duelistOf(o);
    return d ? firstName(d) : "the bot";
};

export default function OpponentPicker({
    choice,
    onChoose,
    onClose,
    disabled,
    deckPicker,
    action,
}: {
    choice: Opponent;
    onChoose: (o: Opponent) => void;
    /** Escape, or a tap outside. */
    onClose: () => void;
    disabled?: boolean;
    /** Your deck, chosen above the button. */
    deckPicker: ReactNode;
    /** The buttons that start the match (and go back). */
    action: ReactNode;
}) {
    useEffect(() => {
        const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [onClose]);
    const duelist = duelistOf(choice);
    const era = duelist && choice.kind === "duelist" ? duelistDeck(duelist, choice.era) : null;

    const tile = (key: string, on: boolean, label: string, face: ReactNode, sub: string, pick: () => void) => (
        <button key={key} type="button" role="radio" aria-checked={on} aria-label={label} className={`op-tile ${on ? "is-on" : ""}`} disabled={disabled} onClick={pick}>
            {face}
            <span className="op-tile__name">{label}</span>
            <small>{sub}</small>
        </button>
    );

    // Over the whole screen, as chess.com's: the one chosen on stage, everyone in the roster beside.
    return createPortal(
        <div className="op-overlay" onClick={onClose}>
            <div className="op" role="dialog" aria-modal="true" aria-label="Choose your opponent" onClick={(e) => e.stopPropagation()}>
                <div className="op-side">
                    <div className="op-stage">
                        <div className={`op-figure ${duelist ? "" : "op-figure--bot"}`}>{duelist ? <img key={duelist.id} src={sprite(duelist)} alt="" /> : <BotGlyph />}</div>
                        <div className="op-info">
                            <b className="op-name">{duelist ? duelist.name : "Practice Bot"}</b>
                            <span className="op-rating">
                                {duelist ? (
                                    <>
                                        <i>{duelist.rating}</i> · {LEVEL_NAMES[duelist.level]}
                                    </>
                                ) : (
                                    "Plays a copy of your deck"
                                )}
                            </span>
                            <p className="op-blurb">{duelist ? duelist.blurb : "A mirror match: learn your own deck from both sides of the table."}</p>
                            {duelist && duelist.eras.length > 1 && (
                                <div className="op-chips" role="radiogroup" aria-label={`${firstName(duelist)}'s deck`}>
                                    {duelist.eras.map((e) => (
                                        <button
                                            key={e.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={era?.era.id === e.id}
                                            className={`op-chip ${era?.era.id === e.id ? "is-on" : ""}`}
                                            disabled={disabled}
                                            onClick={() => onChoose({ kind: "duelist", id: duelist.id, era: e.id })}
                                        >
                                            {e.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {duelist && duelist.eras.length === 1 && <span className="op-era">{duelist.eras[0]!.label}</span>}
                            {choice.kind === "bot" && (
                                <div className="op-chips" role="radiogroup" aria-label="How well the bot plays">
                                    {BOT_LEVELS.map((l) => (
                                        <button
                                            key={l}
                                            type="button"
                                            role="radio"
                                            aria-checked={choice.level === l}
                                            className={`op-chip ${choice.level === l ? "is-on" : ""}`}
                                            disabled={disabled}
                                            onClick={() => onChoose({ kind: "bot", level: l })}
                                        >
                                            {LEVEL_NAMES[l]}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {era && (
                                <small className="op-credit">
                                    Deck:{" "}
                                    <a href={encodeURI(era.deck.url)} target="_blank" rel="noreferrer">
                                        {era.era.source.name}
                                    </a>{" "}
                                    by {era.era.source.author}
                                </small>
                            )}
                        </div>
                    </div>

                    {deckPicker}
                    {action}
                </div>

                {/* Everyone, weakest first. */}
                <div className="op-list">
                    <h3 className="op-title">Choose your opponent</h3>
                    <div className="op-roster" role="radiogroup" aria-label="Opponents">
                        <section className="op-group">
                            <h4>Practice</h4>
                            <div className="op-tiles">
                                {tile(
                                    "bot",
                                    choice.kind === "bot",
                                    "Practice Bot",
                                    <span className="op-face op-face--bot">
                                        <BotGlyph />
                                    </span>,
                                    "Your deck",
                                    () =>
                                        onChoose({
                                            kind: "bot",
                                            level: choice.kind === "bot" ? choice.level : "normal",
                                        }),
                                )}
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
                                            <span
                                                className="op-face"
                                                style={{
                                                    backgroundImage: `url('${sprite(d)}')`,
                                                    backgroundPositionX: FACE_X[d.id] ?? "50%",
                                                }}
                                            />,
                                            String(d.rating),
                                            () =>
                                                onChoose({
                                                    kind: "duelist",
                                                    id: d.id,
                                                    era: duelist?.id === d.id && era ? era.era.id : d.eras[0]!.id,
                                                }),
                                        ),
                                    )}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
