import { PublicUserSchema, type PublicUser } from "@ygo/shared";

/*
 * Browser-side client for the API's account endpoints (`/api/auth/*`).
 *
 * In production the site and API share one origin, so the base is empty. For
 * local development set NEXT_PUBLIC_API_URL=http://localhost:4000 (the Next dev
 * server runs on :3000); the API's ALLOWED_ORIGINS must then list this origin.
 * The session lives in an httpOnly cookie, so every call sends credentials.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Where Google sign-in starts; a full-page navigation, not a fetch. */
export const GOOGLE_START_URL = `${API_BASE}/api/auth/google/start`;

export interface ApiFailure {
    ok: false;
    status: number;
    message: string;
    /** Which unique field clashed, on a 409. */
    field?: string;
}

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** The most useful message in an error body: the first field problem, else `error`. */
function failureFrom(status: number, body: unknown): ApiFailure {
    if (!isRecord(body)) return { ok: false, status, message: `Request failed (${status})` };
    const issues = Array.isArray(body.issues) ? (body.issues as unknown[]) : [];
    const first = issues.find(isRecord);
    const message =
        first && typeof first.message === "string"
            ? `${typeof first.path === "string" && first.path ? `${first.path}: ` : ""}${first.message}`
            : typeof body.error === "string"
              ? body.error
              : `Request failed (${status})`;
    return { ok: false, status, message, ...(typeof body.field === "string" ? { field: body.field } : {}) };
}

async function request(path: string, method: "GET" | "POST", payload?: unknown): Promise<{ status: number; body: unknown }> {
    let response: Response;
    try {
        response = await fetch(`${API_BASE}/api/auth${path}`, {
            method,
            credentials: "include",
            ...(payload === undefined
                ? {}
                : { headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }),
        });
    } catch {
        return { status: 0, body: { error: "Can't reach the server. Is the API running?" } };
    }
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
}

/** Runs a request and parses the success body with `parse`; anything else is an `ApiFailure`. */
async function call<T>(
    path: string,
    method: "GET" | "POST",
    payload: unknown,
    parse: (body: unknown) => T | null,
): Promise<ApiResult<T>> {
    const { status, body } = await request(path, method, payload);
    if (status >= 200 && status < 300) {
        const data = parse(body);
        if (data !== null) return { ok: true, data };
        return { ok: false, status, message: "The server's answer wasn't what we expected" };
    }
    return failureFrom(status, body);
}

const parseUser = (body: unknown): PublicUser | null => {
    const parsed = PublicUserSchema.safeParse(isRecord(body) ? body.user : undefined);
    return parsed.success ? parsed.data : null;
};
const parseNothing = (): true => true;

/** The signed-in user, or null when signed out. */
export async function getMe(): Promise<PublicUser | null> {
    // `false` marks a clean "signed out", which isn't a parse failure.
    const result = await call("/me", "GET", undefined, (body) => (isRecord(body) && body.user === null ? false : parseUser(body)));
    return result.ok && result.data ? result.data : null;
}

export const signUp = (input: { email: string; password: string; duelistName: string }) => call("/signup", "POST", input, parseUser);
export const signIn = (input: { identifier: string; password: string }) => call("/login", "POST", input, parseUser);
export const signOut = () => call("/logout", "POST", undefined, parseNothing);

export async function checkDuelistName(name: string): Promise<{ available: boolean; reason?: string }> {
    const result = await call("/duelist-name-available?name=" + encodeURIComponent(name), "GET", undefined, (body) =>
        isRecord(body) && typeof body.available === "boolean"
            ? { available: body.available, ...(typeof body.reason === "string" ? { reason: body.reason } : {}) }
            : null,
    );
    return result.ok ? result.data : { available: false, reason: result.message };
}

export const resendVerification = () => call("/verify/send", "POST", undefined, parseNothing);
export const verifyEmail = (token: string) => call("/verify", "POST", { token }, parseNothing);
export const forgotPassword = (email: string) => call("/password/forgot", "POST", { email }, parseNothing);
export const resetPassword = (token: string, password: string) => call("/password/reset", "POST", { token, password }, parseNothing);

export interface GoogleClaim {
    email: string;
    name?: string;
}

/** The Google identity waiting for a duelist name, or null if there isn't one. */
export async function getGoogleClaim(): Promise<GoogleClaim | null> {
    const result = await call("/google/claim", "GET", undefined, (body) =>
        isRecord(body) && typeof body.email === "string"
            ? { email: body.email, ...(typeof body.name === "string" ? { name: body.name } : {}) }
            : null,
    );
    return result.ok ? result.data : null;
}

export const claimGoogleName = (duelistName: string) => call("/google/claim", "POST", { duelistName }, parseUser);
