/** @jest-environment node */
import { fetchCardsByIds } from "@/lib/api";

const card = (id: number) => ({ id, name: `Card ${id}`, card_images: [{ id, image_url: "", image_url_small: "", image_url_cropped: "" }] });
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const idsIn = (url: string) => new URL(url, "http://site").searchParams.get("id")!.split(",").map(Number);

afterEach(() => jest.restoreAllMocks());

describe("card data", () => {
    it("asks our server, in batches short enough for any URL limit", async () => {
        const urls: string[] = [];
        jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const url = String(input);
            urls.push(url);
            return json({ data: idsIn(url).map(card) });
        });
        const ids = Array.from({ length: 450 }, (_, i) => 1000 + i);
        const cards = await fetchCardsByIds(ids);
        expect(cards).toHaveLength(450);
        expect(urls.every((u) => u.startsWith("/api/cards?id="))).toBe(true);
        expect(urls.map((u) => idsIn(u).length)).toEqual([200, 200, 50]);
    });

    it("falls back to YGOPRODeck where there is no server, and one failed batch loses only its own cards", async () => {
        jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const url = String(input);
            // No API here: the static host answers with a page.
            if (url.startsWith("/api/")) return new Response("<html>", { status: 404, headers: { "content-type": "text/html" } });
            const ids = idsIn(url);
            if (ids.includes(5000)) throw new TypeError("Failed to fetch");
            return json({ data: ids.map(card) });
        });
        const ids = Array.from({ length: 400 }, (_, i) => 5000 + i);
        const cards = await fetchCardsByIds(ids);
        expect(cards.map((c) => c.id)).toEqual(ids.slice(200));
    });
});
