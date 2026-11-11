// Record Match asks before a result is sent: Cancel keeps the choice open, "I won" reports it.
//   node scripts/drivers/report-confirm.mjs
import { launchSeeded, makeSave, outPath, readSave } from "./_lib.mjs";

const { browser, page, errors } = await launchSeeded(makeSave({ currentSetIndex: 0 }), { route: "/record-match/" });
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"} ${what}`); if (!ok) failed++; };

try {
    const victory = page.getByRole("button", { name: "Record a victory" });
    await victory.click();
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor({ timeout: 5000 });
    await page.screenshot({ path: outPath("report-confirm-dialog.png") });
    check(/Record a victory\?/.test(await dialog.textContent()), "the dialog names the result");

    await page.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "detached" });
    check((await readSave(page)).currentSetIndex === 0, "Cancel sends nothing");
    check(await victory.isEnabled(), "Cancel leaves the choice open");

    await victory.click();
    await page.getByRole("button", { name: "I won" }).click();
    await page.getByRole("button", { name: "Spin the wheel" }).waitFor({ timeout: 8000 });
    check((await readSave(page)).currentSetIndex === 1, "I won reports the victory");
    const real = errors.filter((e) => !/ERR_CONNECTION_REFUSED/.test(e)); // no API server in guest runs
    check(real.length === 0, `no console errors (${real.join(" | ")})`);
} finally {
    await browser.close();
}
process.exit(failed ? 1 : 0);
