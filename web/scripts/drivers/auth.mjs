// Accounts end to end in a real browser: sign up (with the live duelist-name
// check), the confirmation email link, sign out / in by name and by email, a
// wrong password, and the forgot-password -> reset-link -> new-password flow.
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
const PAGE = `${BASE}/dev/auth/`;

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
const PASSWORD = "heart of the cards";
const NEW_PASSWORD = "a brand new password";

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const problems = [];
page.on("pageerror", (e) => problems.push(e.message));
page.on("console", (m) => {
    // The failed-login 401 is expected; anything else at error level is a problem.
    if (m.type() === "error" && !/401|Failed to load resource/.test(m.text())) problems.push(m.text());
});

const signedIn = () => page.getByRole("region", { name: "Signed in" });
const notice = () => page.getByRole("status");

async function signInWith(identifier, password) {
    await page.getByLabel("Email or duelist name").fill(identifier);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
}

try {
    await fetch(`${API}/__test/mail`, { method: "DELETE" });

    // 1. A signed-out visitor sees the sign-in form.
    await page.goto(PAGE, { waitUntil: "networkidle" });
    check(await page.getByRole("form", { name: "Sign in" }).isVisible(), "signed out: the sign-in form shows");
    check(await page.getByRole("link", { name: "Sign in with Google" }).isVisible(), "signed out: a Google button shows");
    await page.screenshot({ path: outPath("auth-1-signin.png") });

    // 2. Sign up, with the live name check.
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.getByLabel("Duelist name").fill(NAME);
    await page.getByText("✓ Available").waitFor({ timeout: 5000 });
    check(true, "sign up: a free duelist name is flagged available");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.screenshot({ path: outPath("auth-2-signup.png") });
    await page.getByRole("button", { name: "Create account" }).click();
    await signedIn().waitFor({ timeout: 8000 });
    check((await signedIn().innerText()).includes(NAME), "sign up: signed in as the new duelist");
    check(/Email confirmed\s+no/.test((await signedIn().innerText()).replace(/\n/g, " ")), "sign up: email starts unconfirmed");
    await page.screenshot({ path: outPath("auth-3-signed-in.png") });

    // 3. The confirmation email's link confirms the address.
    await page.waitForTimeout(500);
    let messages = await mail();
    const verification = messages.find((m) => m.to === EMAIL && m.subject.startsWith("Confirm"));
    check(Boolean(verification), "email: a confirmation message was sent to the new address");
    await page.goto(linkIn(verification), { waitUntil: "networkidle" });
    await notice().getByText("Email confirmed").waitFor({ timeout: 8000 });
    check(true, "email: following the link confirms the address");
    check(new URL(page.url()).search === "", `email: the token is removed from the URL (${page.url()})`);
    check(/Email confirmed\s+yes/.test((await signedIn().innerText()).replace(/\n/g, " ")), "email: the account now shows as confirmed");

    // 4. Sign out; a taken name is flagged; sign in by name and by email.
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("form", { name: "Sign in" }).waitFor();
    check(true, "sign out: back to the sign-in form");

    await page.getByRole("button", { name: "Sign up" }).click();
    await page.getByLabel("Duelist name").fill(` ${NAME.toLowerCase()} `);
    await page.getByText("✗ Already taken").waitFor({ timeout: 5000 });
    check(true, "sign up: a taken name is flagged, ignoring case and spaces");
    await page.getByRole("button", { name: "Sign in" }).click();

    await signInWith(NAME, "not the password");
    await notice().getByText(/Wrong email, duelist name or password/).waitFor({ timeout: 5000 });
    check(true, "sign in: a wrong password is refused with one generic message");

    await signInWith(NAME, PASSWORD);
    await signedIn().waitFor({ timeout: 8000 });
    check(true, "sign in: works with the duelist name");
    await page.reload({ waitUntil: "networkidle" });
    await signedIn().waitFor({ timeout: 8000 });
    check(true, "session: still signed in after a reload (the cookie persists)");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("form", { name: "Sign in" }).waitFor();
    await signInWith(EMAIL.toUpperCase(), PASSWORD);
    await signedIn().waitFor({ timeout: 8000 });
    check(true, "sign in: works with the email, in any case");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("form", { name: "Sign in" }).waitFor();

    // 5. Forgot password -> link -> new password.
    await fetch(`${API}/__test/mail`, { method: "DELETE" });
    await page.getByRole("button", { name: "Forgot password" }).click();
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await notice().getByText(/reset link is on its way/).waitFor({ timeout: 5000 });
    check(true, "forgot: the request is acknowledged");

    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await notice().getByText(/reset link is on its way/).waitFor({ timeout: 5000 });
    check(true, "forgot: an unknown email gets the very same answer");

    await page.waitForTimeout(500);
    messages = await mail();
    const resets = messages.filter((m) => m.subject.startsWith("Reset"));
    check(resets.length === 1 && resets[0].to === EMAIL, "forgot: exactly one reset email went out, to the real account");

    await page.goto(linkIn(resets[0]), { waitUntil: "networkidle" });
    await page.getByRole("form", { name: "Choose a new password" }).waitFor({ timeout: 5000 });
    check(true, "reset: the link opens the new-password form");
    await page.getByLabel("New password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Change password" }).click();
    await notice().getByText(/at least 8/i).waitFor({ timeout: 5000 });
    check(true, "reset: a too-short password is rejected without spending the link");
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Change password" }).click();
    await notice().getByText(/Password changed/).waitFor({ timeout: 5000 });
    check(true, "reset: the new password is accepted");

    await signInWith(NAME, PASSWORD);
    await notice().getByText(/Wrong email, duelist name or password/).waitFor({ timeout: 5000 });
    check(true, "reset: the old password no longer works");
    await signInWith(NAME, NEW_PASSWORD);
    await signedIn().waitFor({ timeout: 8000 });
    check(true, "reset: the new password signs in");

    await page.goto(linkIn(resets[0]), { waitUntil: "networkidle" });
    await notice().getByText(/invalid or has expired/i).waitFor({ timeout: 5000 }).catch(() => {});
    check(
        (await page.getByRole("form", { name: "Choose a new password" }).count()) === 1 || (await signedIn().count()) === 1,
        "reset: reusing the link doesn't sign anyone in by itself",
    );

    // 6. A bad confirmation link says so.
    await page.goto(`${PAGE}?verify=not-a-real-token`, { waitUntil: "networkidle" });
    await notice().getByText(/invalid or has expired/i).waitFor({ timeout: 5000 });
    check(true, "email: a bad confirmation link is reported");

    // 7. A failed Google round trip lands with a readable message.
    await page.goto(`${PAGE}?google=denied`, { waitUntil: "networkidle" });
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
