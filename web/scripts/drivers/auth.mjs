// Accounts end to end through the menu: the invitation sign-up (live name
// check, star chips), the confirmation link, sign out / in by name and by email,
// a wrong password, and forgot password -> reset link -> new password.
//
// Needs the API on an in-memory database with captured email, and the web dev
// server pointed at it (see api/scripts/test-server.ts). From the repo root:
//
//   npm run test-server -w @ygo/api
//   NEXT_PUBLIC_API_URL=http://localhost:4100 npm run dev -w web
//   node web/scripts/drivers/auth.mjs          (from web/: node scripts/drivers/auth.mjs)
//
// Override with API_BASE (default http://localhost:4100). Google sign-in needs a
// real Google account, so it isn't driven here; the API tests cover it with a fake.

import { BASE, launchBrowser, outPath } from "./_lib.mjs";

const API = process.env.API_BASE || "http://localhost:4100";
const MENU = `${BASE}/menu/`;

let failures = 0;
const check = (ok, label) => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures++;
};

const mail = async () => (await fetch(`${API}/__test/mail`)).json();
const linkIn = (message) => message.text.match(/https?:\/\/\S+/)[0];

// Unique per run so the driver can be repeated against one server.
const suffix = Date.now().toString(36).slice(-6);
const NAME = `Drv${suffix}`;
const EMAIL = `drv${suffix}@example.com`;
const PASSWORD = "Heart of the cards 1";
const NEW_PASSWORD = "A brand new password 2";

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(e.message));
page.on("console", (m) => {
    // The failed-login 401 is expected; anything else at error level is a problem.
    if (m.type() === "error" && !/401|Failed to load resource/.test(m.text())) problems.push(m.text());
});

const item = (label) => page.getByRole("button", { name: new RegExp(`^${label}`) });
const notice = () => page.getByRole("status");
const signedInAs = () => page.getByText(`Signed in as ${NAME}`);
const me = async () => (await (await context.request.get(`${API}/api/auth/me`)).json()).user;

async function signInWith(identifier, password) {
    await page.getByLabel("Email or duelist name").fill(identifier);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
}

try {
    await fetch(`${API}/__test/mail`, { method: "DELETE" });

    // 1. Signed out, the menu offers sign in, sign up and guest play.
    await page.goto(MENU, { waitUntil: "networkidle" });
    for (const label of ["SIGN IN", "SIGN UP", "PLAY AS GUEST"]) check(await item(label).isVisible(), `signed out: the menu offers ${label}`);
    await page.screenshot({ path: outPath("auth-1-menu.png") });

    // 2. The invitation: break the seal, fill the letter, watch the chips light up.
    await item("SIGN UP").click();
    await page.getByRole("button", { name: "Break the seal" }).click();
    await page.getByRole("form", { name: "Sign up" }).waitFor();
    await page.getByLabel("Duelist name", { exact: true }).fill(NAME);
    await page.getByText("✓ Available").waitFor({ timeout: 5000 });
    check(true, "sign up: a free duelist name is flagged available");
    await page.getByLabel("Email", { exact: true }).fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    check((await page.getByRole("img", { name: /ready$/ }).count()) === 4, "sign up: all four star chips light up");
    await page.screenshot({ path: outPath("auth-2-invitation.png") });
    await page.getByRole("button", { name: "Accept the Invitation" }).click();
    await page.getByText(`Welcome, ${NAME}`).waitFor({ timeout: 8000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: outPath("auth-3-glove.png") });
    await page.getByRole("button", { name: "Enter the Kingdom" }).click();
    await signedInAs().waitFor({ timeout: 5000 });
    check(true, "sign up: back on the menu, signed in as the new duelist");
    check((await me())?.emailVerified === false, "sign up: the email starts unconfirmed");

    // 3. The confirmation email's link confirms the address, on the menu.
    await page.waitForTimeout(500);
    let messages = await mail();
    const verification = messages.find((m) => m.to === EMAIL && m.subject.startsWith("Confirm"));
    check(Boolean(verification), "email: a confirmation message was sent to the new address");
    await page.goto(linkIn(verification), { waitUntil: "networkidle" });
    await notice().getByText("Email confirmed").waitFor({ timeout: 8000 });
    check(new URL(page.url()).search === "", `email: the token is removed from the URL (${page.url()})`);
    check((await me())?.emailVerified === true, "email: the account is now confirmed");

    // 4. Sign out; a taken name is flagged; sign in by name and by email.
    await item("SIGN OUT").click();
    await item("SIGN IN").waitFor();
    check(true, "sign out: the menu is signed out again");

    await item("SIGN UP").click();
    await page.getByRole("button", { name: "Break the seal" }).click();
    await page.getByLabel("Duelist name", { exact: true }).fill(` ${NAME.toLowerCase()} `);
    await page.getByText("✗ Already taken").waitFor({ timeout: 5000 });
    check(true, "sign up: a taken name is flagged, ignoring case and spaces");
    await page.getByRole("button", { name: "◀ BACK TO MENU" }).click();

    await item("SIGN IN").click();
    await signInWith(NAME, "not the password");
    await notice().getByText(/Wrong email, duelist name or password/).waitFor({ timeout: 5000 });
    check(true, "sign in: a wrong password is refused with one generic message");
    await signInWith(NAME, PASSWORD);
    await signedInAs().waitFor({ timeout: 8000 });
    check(true, "sign in: works with the duelist name");
    await page.reload({ waitUntil: "networkidle" });
    await signedInAs().waitFor({ timeout: 8000 });
    check(true, "session: still signed in after a reload (the cookie persists)");
    await item("SIGN OUT").click();
    await item("SIGN IN").click();
    await signInWith(EMAIL.toUpperCase(), PASSWORD);
    await signedInAs().waitFor({ timeout: 8000 });
    check(true, "sign in: works with the email, in any case");
    await item("SIGN OUT").click();

    // 5. Forgot password -> link -> new password.
    await fetch(`${API}/__test/mail`, { method: "DELETE" });
    await item("SIGN IN").click();
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.getByLabel("Email", { exact: true }).fill(EMAIL);
    await page.getByRole("button", { name: "Send Reset Link" }).click();
    await notice().getByText(/reset link is on its way/).waitFor({ timeout: 5000 });
    check(true, "forgot: the request is acknowledged");
    await page.getByLabel("Email", { exact: true }).fill("nobody@example.com");
    await page.getByRole("button", { name: "Send Reset Link" }).click();
    await notice().getByText(/reset link is on its way/).waitFor({ timeout: 5000 });
    check(true, "forgot: an unknown email gets the very same answer");

    await page.waitForTimeout(500);
    messages = await mail();
    const resets = messages.filter((m) => m.subject.startsWith("Reset"));
    check(resets.length === 1 && resets[0].to === EMAIL, "forgot: exactly one reset email went out, to the real account");

    await page.goto(linkIn(resets[0]), { waitUntil: "networkidle" });
    await page.getByRole("form", { name: "Choose a new password" }).waitFor({ timeout: 5000 });
    check(true, "reset: the link opens the new-password form on the menu");
    await page.getByLabel("New password", { exact: true }).fill("short");
    check(await page.getByRole("button", { name: "Change Password" }).isDisabled(), "reset: a too-short password can't be sent");
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Change Password" }).click();
    await notice().getByText(/Password changed/).waitFor({ timeout: 5000 });
    check(true, "reset: the new password is accepted");
    await signInWith(NAME, PASSWORD);
    await notice().getByText(/Wrong email, duelist name or password/).waitFor({ timeout: 5000 });
    check(true, "reset: the old password no longer works");
    await signInWith(NAME, NEW_PASSWORD);
    await signedInAs().waitFor({ timeout: 8000 });
    check(true, "reset: the new password signs in");

    // 6. A bad confirmation link says so.
    await page.goto(`${MENU}?verify=not-a-real-token`, { waitUntil: "networkidle" });
    await notice().getByText(/invalid or has expired/i).waitFor({ timeout: 5000 });
    check(true, "email: a bad confirmation link is reported");

    // 7. A failed Google round trip lands with a readable message.
    await item("SIGN OUT").click();
    await page.goto(`${MENU}?google=denied`, { waitUntil: "networkidle" });
    await notice().getByText(/cancelled/i).waitFor({ timeout: 5000 });
    check(true, "google: a cancelled sign-in is reported");
    await page.screenshot({ path: outPath("auth-4-google-denied.png") });
} catch (error) {
    check(false, `driver stopped early: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
    await page.screenshot({ path: outPath("auth-failure.png") }).catch(() => {});
}

check(problems.length === 0, `no page errors or console errors ${problems.join(" | ")}`);
await browser.close();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
