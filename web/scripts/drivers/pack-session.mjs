// A signed-in server series end to end: create it from the save list, open
// packs, reload mid-reveal and resume on the same pack, save, get refused a
// second opening, report a win and spin the server's wheel.
//
//   npm run test-server -w @ygo/api            (copies card data from api/.env's database)
//   NEXT_PUBLIC_API_URL=http://localhost:4100 npm run dev -w web
//   node web/scripts/drivers/pack-session.mjs

import { BASE, launchBrowser, outPath } from "./_lib.mjs";

const API = process.env.API_BASE || "http://localhost:4100";
let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const suffix = Date.now().toString(36).slice(-6);
const NAME = `Pk${suffix}`;

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
const problems = [];
const dialogs = [];
page.on("pageerror", (e) => problems.push(e.message));
page.on("console", (m) => m.type() === "error" && !/409|Failed to load resource/.test(m.text()) && problems.push(`${new URL(page.url()).pathname}: ${m.text().split("\n")[0]}`));
page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.accept();
});

const api = async (path) => (await context.request.get(`${API}/api/series${path}`)).json();

try {
    const signup = await context.request.post(`${API}/api/auth/signup`, {
        headers: { origin: BASE },
        data: { email: `${NAME.toLowerCase()}@example.com`, password: "heart of the cards", duelistName: NAME },
    });
    check(signup.ok(), "signed up through the API");

    await page.goto(`${BASE}/menu/`, { waitUntil: "networkidle" });
    // The save list loads the set list; leaving before it lands would abort it and log an error.
    const setList = page.waitForResponse((r) => r.url().includes("cardsets.php"), { timeout: 30000 });
    await page.getByRole("button", { name: /^CAMPAIGN MODE/ }).click();
    check(await page.getByText("Your Series").isVisible(), "signed in: the save list shows server series");
    await page.getByRole("button", { name: "+ NEW GAME" }).click();
    await page.getByPlaceholder("Enter Name...").fill("Driver Run");
    await page.getByLabel("Packs per Set").selectOption("12");
    await page.getByRole("button", { name: "CREATE" }).click();
    await page.getByText("Driver Run").waitFor();
    const [created] = (await api("")).series;
    check(created?.rules.packsPerSet === 12, "the series was created on the server with 12 packs per set");

    await page.getByText("Driver Run").click();
    await page.waitForURL(/timeline/);
    await (await setList).finished();
    await page.goto(`${BASE}/packs/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open 12 Packs" }).click();
    await page.getByText("Pack 1 of 12").waitFor();
    await page.getByRole("button", { name: "Flip All" }).click();
    await page.getByRole("button", { name: "Next Pack" }).click();
    await page.getByRole("button", { name: "Flip All" }).click();
    await page.waitForTimeout(1200); // flips are sent in batches

    await page.reload({ waitUntil: "networkidle" });
    await page.getByText(/Pack \d+ of 12/).waitFor();
    check(await page.getByText("Pack 2 of 12").isVisible(), "a reload resumes on the same pack");
    check(await page.getByRole("button", { name: "Next Pack" }).isEnabled(), "its cards are still face up");
    await page.screenshot({ path: outPath("pack-session-resume.png") });

    await page.getByRole("button", { name: "Open All" }).click();
    // Leaving before the collection's card lookup lands would abort it and log an error.
    const cardInfo = page.waitForResponse((r) => r.url().includes("cardinfo.php") && r.url().includes("id="), { timeout: 30000 });
    await page.getByRole("button", { name: /Done & Save/ }).click();
    await page.waitForURL(/collection/);
    await cardInfo;
    await page.waitForLoadState("networkidle");
    const { me } = await api(`/${created.id}`);
    check(Object.values(me.collection).reduce((a, b) => a + b, 0) === 12 * 9, "all 108 cards were saved to the server collection");

    await page.goto(`${BASE}/packs/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open 12 Packs" }).click();
    await page.waitForTimeout(800);
    check(dialogs.some((d) => /already opened/.test(d)), "a second opening of the same set is refused");

    await page.goto(`${BASE}/record-match/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /victory/i }).click();
    await page.getByRole("button", { name: "Spin the wheel" }).click();
    await page.getByRole("button", { name: "Claim prize" }).waitFor({ timeout: 8000 });
    const shown = (await page.locator(".wheel-prize__name").textContent())?.trim();
    const after = await api(`/${created.id}`);
    const reward = after.me.rewards[0];
    check(after.series.currentSetIndex === created.currentSetIndex + 1, "the win advanced the set");
    check(reward && reward.prizeId !== "wheel-spin" && reward.prizeId !== "snatch-steal", `the server picked the prize (${reward?.prizeId})`);
    check(!!shown && shown.length > 0, `the wheel landed on "${shown}"`);
    await page.screenshot({ path: outPath("pack-session-wheel.png") });

    check(problems.length === 0, `no page errors${problems.length ? `: ${problems.join(" | ")}` : ""}`);
} finally {
    await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
