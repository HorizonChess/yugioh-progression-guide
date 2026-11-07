import { eraText, setCardEra } from "@/lib/card-era";

const sangan = { name: "Sangan", desc: "If this card is sent from the field to the GY: Add 1 monster with 1500 or less ATK from your Deck to your hand, but you cannot activate cards, or the effects of cards, with that name for the rest of this turn." };

describe("card text by era", () => {
    afterEach(() => setCardEra(null));

    it("shows today's text with no series", () => {
        expect(eraText(sangan)).toEqual({ text: sangan.desc });
    });

    it("shows the original text before the errata, with a note", () => {
        setCardEra("2008-07-08");
        const era = eraText(sangan);
        expect(era.text).not.toContain("cannot activate cards");
        expect(era.note).toBe("As printed before its errata (2016)");
    });

    it("shows the GOAT text in 2005 and before", () => {
        setCardEra("2004-03-01");
        expect(eraText({ name: "Scapegoat", desc: "today" }).note).toBe("As played in 2005 (GOAT format)");
    });

    it("shows today's text once the errata is out", () => {
        setCardEra("2017-07-29");
        expect(eraText(sangan).text).toBe(sangan.desc);
    });
});
