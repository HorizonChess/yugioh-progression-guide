import { cardVersionAt } from "@ygo/shared";

/*
 * Cards read as they did at the series' current set: a card whose functional errata came later
 * shows its original text, and in 2005 and before a card shows its GOAT format text, the same
 * versions a duel plays. The date follows the active series (see CardEraSync).
 */

let eraDate: string | null = null;

/** The current set's release date, or null (no series: today's text). */
export const setCardEra = (date: string | null) => {
    eraDate = date;
};
export const cardEra = () => eraDate;

/** The card's text in the current era, and a note when it isn't today's. */
export function eraText(card: { name: string; desc: string }, date: string | null = eraDate): { text: string; note?: string } {
    const version = cardVersionAt(card.name, date);
    if (!version) return { text: card.desc };
    const note = version.kind === "goat"
        ? "As played in 2005 (GOAT format)"
        : version.until
          ? `As printed before its errata (${version.until.slice(0, 4)})`
          : "As originally printed";
    return { text: version.text, note };
}
