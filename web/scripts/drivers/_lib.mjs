// Shared helpers for the Playwright driver scripts in this folder.
//
// These drivers exercise real app flows end-to-end (seed a save into
// localStorage, drive the UI, assert + screenshot) so behaviour can be verified
// in the actual browser — not just via tsc/lint. Run them against a dev server
// on port 3000 (`npm run dev`), from the `web/` directory:
//
//   node scripts/drivers/rewards-ban.mjs
//
// Screenshots land in scripts/drivers/out/ (gitignored). Keep these scripts
// checked in and reuse/extend them rather than rewriting throwaway drivers.

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export const STORE_KEY = "yugioh-progression-saves-v2";
export const BASE = process.env.APP_BASE || "http://localhost:3000";

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(HERE, "out");

/**
 * Launch Chromium. Set PW_CHANNEL=chrome (or msedge) to use an installed browser
 * instead of Playwright's own download (`npx playwright install chromium`).
 */
export function launchBrowser() {
    return chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
}

/** Absolute path for a screenshot in out/ (auto-created). */
export function outPath(name) {
    mkdirSync(OUT_DIR, { recursive: true });
    return join(OUT_DIR, name);
}

/**
 * A minimal save slot with sane defaults. Pass `rewards`, `bannedCardIds`, etc.
 * to override. `currentSetIndex` indexes fetchAllSets() (core sets).
 */
export function makeSave(overrides = {}) {
    return {
        id: "test-save",
        name: "Tester",
        currentSetIndex: 30,
        collection: [],
        savedDecks: [],
        rewards: [],
        bannedCardIds: [],
        ...overrides,
    };
}

/**
 * Launch a browser, seed the given save into localStorage on `route`, reload so
 * the app picks it up, and return { browser, page, errors }. `errors` collects
 * console errors for assertions. Remember to `await browser.close()`.
 */
export async function launchSeeded(save, { route = "/rewards", viewport = { width: 1440, height: 950 } } = {}) {
    const browser = await launchBrowser();
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.evaluate(
        ([k, v]) => localStorage.setItem(k, v),
        [STORE_KEY, JSON.stringify({ saves: [save], activeSaveId: save.id })]
    );
    await page.reload({ waitUntil: "networkidle" });
    return { browser, page, errors };
}

/** Read the (single) seeded save back out of localStorage. */
export async function readSave(page) {
    return page.evaluate((k) => JSON.parse(localStorage.getItem(k)).saves[0], STORE_KEY);
}

/** A reward entry with defaults; override prizeId/status/etc. as needed. */
export function reward(overrides = {}) {
    return {
        id: `rw-${Math.random().toString(36).slice(2, 8)}`,
        prizeId: "wildcard-common",
        wonFromPackName: "Core",
        wonFromSetIndex: 30,
        wonDate: new Date().toISOString(),
        status: "available",
        ...overrides,
    };
}
