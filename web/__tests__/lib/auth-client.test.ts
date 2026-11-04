import { checkDuelistName, getGoogleClaim, getMe, signIn, signUp } from "@/lib/auth-client";

const USER = {
    id: "u1",
    email: "yami@example.com",
    emailVerified: false,
    duelistName: "Yami",
    role: "user",
    hasPassword: true,
    hasGoogle: false,
};

/** Makes the next fetch answer with `status` and a JSON `body` (or fail the way a dead network does). */
function reply(status: number, body: unknown) {
    global.fetch = jest.fn().mockResolvedValue({ status, json: () => Promise.resolve(body) }) as unknown as typeof fetch;
}

afterEach(() => jest.restoreAllMocks());

describe("auth client", () => {
    it("sends credentials with every call, so the session cookie travels", async () => {
        reply(200, { user: USER });
        await getMe();
        expect(global.fetch).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({ method: "GET", credentials: "include" }));
    });

    it("returns the user from a good sign-in, and posts JSON", async () => {
        reply(200, { user: USER });
        const result = await signIn({ identifier: "yami", password: "secret words" });
        expect(result).toEqual({ ok: true, data: USER });
        expect(global.fetch).toHaveBeenCalledWith(
            "/api/auth/login",
            expect.objectContaining({
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ identifier: "yami", password: "secret words" }),
            }),
        );
    });

    it("turns a failed sign-in into its message", async () => {
        reply(401, { error: "Wrong email, duelist name or password" });
        expect(await signIn({ identifier: "x", password: "y" })).toEqual({
            ok: false,
            status: 401,
            message: "Wrong email, duelist name or password",
        });
    });

    it("surfaces the first field problem from a validation error", async () => {
        reply(400, { error: "Invalid input", issues: [{ path: "password", message: "At least 8 characters" }] });
        const result = await signUp({ email: "a@b.co", password: "short", duelistName: "Yami" });
        expect(result).toMatchObject({ ok: false, status: 400, message: "password: At least 8 characters" });
    });

    it("reports which field a duplicate account clashed on", async () => {
        reply(409, { error: "That duelist name is already taken", field: "duelistName" });
        const result = await signUp({ email: "a@b.co", password: "long enough", duelistName: "Yami" });
        expect(result).toMatchObject({ ok: false, status: 409, field: "duelistName" });
    });

    it("is signed out (null) on a 401 or on a malformed user", async () => {
        reply(401, { error: "Sign in required" });
        expect(await getMe()).toBeNull();
        reply(200, { user: { id: 1 } });
        expect(await getMe()).toBeNull();
    });

    it("explains when the server can't be reached", async () => {
        global.fetch = jest.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;
        expect(await signIn({ identifier: "x", password: "y" })).toMatchObject({ ok: false, status: 0, message: expect.stringContaining("Can't reach") });
    });

    it("checks a duelist name, encoding it", async () => {
        reply(200, { available: false, reason: "Already taken" });
        expect(await checkDuelistName("Seto Kaiba & co")).toEqual({ available: false, reason: "Already taken" });
        expect(global.fetch).toHaveBeenCalledWith("/api/auth/duelist-name-available?name=Seto%20Kaiba%20%26%20co", expect.anything());
    });

    it("reads a pending Google identity, or null when there is none", async () => {
        reply(200, { email: "joey@example.com", name: "Joey" });
        expect(await getGoogleClaim()).toEqual({ email: "joey@example.com", name: "Joey" });
        reply(404, { error: "none" });
        expect(await getGoogleClaim()).toBeNull();
    });
});
