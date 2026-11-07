import welcomeJson from "@/data/guide/welcome.json";
import { guide } from "@/lib/guide/store";
import { replayWelcome, welcome, welcomed, welcomeLines } from "@/lib/guide/welcome";

describe("Yugi's welcome", () => {
    beforeEach(() => {
        localStorage.clear();
        guide.reset();
    });

    it("fills in the run: its set, its packs and the rival's own name", () => {
        const duo = welcomeLines("tour", { mode: "duo", set: "Metal Raiders", packs: 12, rival: "Bakura" });
        const text = duo.map((l) => l.text).join(" ");
        expect(text).toContain("Bakura");
        expect(text).toContain("Metal Raiders");
        expect(text).toContain("12 packs");
        expect(text).not.toMatch(/\{\w+\}|Kaiba/);
        // Solo never mentions a rival.
        const solo = welcomeLines("tour", { mode: "solo", set: "Metal Raiders", packs: 12 }).map((l) => l.text).join(" ");
        expect(solo).not.toMatch(/rival|\{\w+\}/i);
    });

    it("picks the wording for the account, and leaves out lines that aren't for it", () => {
        expect(welcomeLines("menu", { account: "guest" }).find((l) => l.key.includes(":account:"))?.text).toMatch(/guest/);
        expect(welcomeLines("menu", { account: "member" }).find((l) => l.key.includes(":account:"))?.text).toMatch(/signed in/);
        // Guests can't start a duo run, so the new-run form doesn't explain the mode to them.
        expect(welcomeLines("new-run", { account: "guest" }).some((l) => l.key.includes(":mode:"))).toBe(false);
        expect(welcomeLines("new-run", { account: "member" }).some((l) => l.key.includes(":mode:"))).toBe(true);
    });

    it("says a welcome once per device, a duo run's tour apart from a solo one's, and replays on request", () => {
        expect(welcome("tour", { mode: "solo" })).toBe(true);
        expect(guide.state().more).toBe(welcomeLines("tour", { mode: "solo" }).length - 1);
        guide.silence();
        expect(welcome("tour", { mode: "solo" })).toBe(false);
        expect(welcomed("tour", { mode: "duo" })).toBe(false);
        replayWelcome();
        expect(welcome("tour", { mode: "solo" })).toBe(true);
    });

    it("doesn't count a welcome as said while the guide is off", () => {
        localStorage.setItem("ygo-guide", "off");
        expect(welcome("collection")).toBe(false);
        localStorage.removeItem("ygo-guide");
        expect(welcome("collection")).toBe(true);
    });

    it("points every line at something, and keeps every wording under 140 characters", () => {
        const all = [...welcomeJson.tour, ...Object.values(welcomeJson.screens).flat()] as Record<string, string>[];
        for (const line of all) {
            expect(line.target).toBeTruthy();
            for (const k of ["text", "solo", "duo", "guest", "member"]) {
                const t = line[k];
                if (t) expect(t.replace("{set}", "Legend of Blue Eyes White Dragon").replace("{rival}", "X".repeat(20)).replace("{packs}", "30").length).toBeLessThanOrEqual(140);
            }
        }
    });
});
