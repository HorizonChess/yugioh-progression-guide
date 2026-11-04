import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthPlayground from "@/components/dev/AuthPlayground";
import * as auth from "@/lib/auth-client";

const mockReplace = jest.fn();
let mockParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
    useRouter: () => ({ replace: mockReplace }),
    useSearchParams: () => mockParams,
}));
jest.mock("@/lib/auth-client");

const api = jest.mocked(auth);

const USER = {
    id: "u1",
    email: "yami@example.com",
    emailVerified: false,
    duelistName: "Yami",
    role: "user" as const,
    hasPassword: true,
    hasGoogle: false,
};

beforeEach(() => {
    jest.resetAllMocks();
    mockParams = new URLSearchParams();
    api.getMe.mockResolvedValue(null);
    api.checkDuelistName.mockResolvedValue({ available: true });
});

describe("AuthPlayground", () => {
    it("shows the sign-in form to a signed-out visitor, with a Google link", async () => {
        render(<AuthPlayground />);
        expect(await screen.findByRole("form", { name: "Sign in" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Sign in with Google" })).toBeInTheDocument();
    });

    it("signs in and shows the account", async () => {
        api.signIn.mockResolvedValue({ ok: true, data: USER });
        render(<AuthPlayground />);
        const user = userEvent.setup();

        await user.type(await screen.findByLabelText("Email or duelist name"), "yami");
        await user.type(screen.getByLabelText("Password"), "heart of the cards");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(api.signIn).toHaveBeenCalledWith({ identifier: "yami", password: "heart of the cards" });
        const panel = await screen.findByRole("region", { name: "Signed in" });
        expect(panel).toHaveTextContent("yami@example.com");
        expect(screen.getByRole("button", { name: "Resend confirmation email" })).toBeInTheDocument();
    });

    it("shows the server's message when sign-in fails", async () => {
        api.signIn.mockResolvedValue({ ok: false, status: 401, message: "Wrong email, duelist name or password" });
        render(<AuthPlayground />);
        const user = userEvent.setup();

        await user.type(await screen.findByLabelText("Email or duelist name"), "yami");
        await user.type(screen.getByLabelText("Password"), "nope nope");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("status")).toHaveTextContent("Wrong email, duelist name or password");
    });

    it("checks the duelist name as you type it into the sign-up form", async () => {
        api.checkDuelistName.mockResolvedValue({ available: false, reason: "Already taken" });
        render(<AuthPlayground />);
        const user = userEvent.setup();

        await user.click(await screen.findByRole("button", { name: "Sign up" }));
        await user.type(screen.getByLabelText("Duelist name"), "Yami");

        expect(await screen.findByText("✗ Already taken")).toBeInTheDocument();
        expect(api.checkDuelistName).toHaveBeenCalledWith("Yami");
    });

    it("confirms an email from a ?verify= link, then clears the URL", async () => {
        mockParams = new URLSearchParams("verify=abc123");
        api.verifyEmail.mockResolvedValue({ ok: true, data: true });
        render(<AuthPlayground />);

        expect(await screen.findByRole("status")).toHaveTextContent("Email confirmed");
        expect(api.verifyEmail).toHaveBeenCalledWith("abc123");
        expect(mockReplace).toHaveBeenCalledWith("/dev/auth/");
    });

    it("reports a bad ?verify= link", async () => {
        mockParams = new URLSearchParams("verify=stale");
        api.verifyEmail.mockResolvedValue({ ok: false, status: 400, message: "This link is invalid or has expired" });
        render(<AuthPlayground />);
        expect(await screen.findByRole("status")).toHaveTextContent("invalid or has expired");
    });

    it("offers a new-password form for a ?reset= link and sends the token", async () => {
        mockParams = new URLSearchParams("reset=tok42");
        api.resetPassword.mockResolvedValue({ ok: true, data: true });
        render(<AuthPlayground />);
        const user = userEvent.setup();

        await user.type(await screen.findByLabelText("New password", { exact: true }), "a brand new password");
        await user.click(screen.getByRole("button", { name: "Change password" }));

        expect(api.resetPassword).toHaveBeenCalledWith("tok42", "a brand new password");
        expect(await screen.findByRole("form", { name: "Sign in" })).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Password changed");
    });

    it("asks a first-time Google user for a duelist name", async () => {
        mockParams = new URLSearchParams("google=claim");
        api.getGoogleClaim.mockResolvedValue({ email: "joey@example.com", name: "Joey Wheeler" });
        api.claimGoogleName.mockResolvedValue({ ok: true, data: { ...USER, email: "joey@example.com", duelistName: "Joey", hasGoogle: true } });
        render(<AuthPlayground />);
        const user = userEvent.setup();

        expect(await screen.findByText(/Signed in with Google as joey@example.com/)).toBeInTheDocument();
        await user.type(screen.getByLabelText("Duelist name"), "Joey");
        await user.click(screen.getByRole("button", { name: "Finish" }));

        expect(api.claimGoogleName).toHaveBeenCalledWith("Joey");
        await waitFor(() => expect(screen.getByRole("region", { name: "Signed in" })).toHaveTextContent("Joey"));
    });

    it.each([
        ["denied", /cancelled/],
        ["unverified", /isn't verified/],
        ["failed", /didn't work/],
    ])("explains a Google outcome of %s", async (outcome, message) => {
        mockParams = new URLSearchParams(`google=${outcome}`);
        render(<AuthPlayground />);
        expect(await screen.findByRole("status")).toHaveTextContent(message);
    });

    it("signs out", async () => {
        api.getMe.mockResolvedValue(USER);
        api.signOut.mockResolvedValue({ ok: true, data: true });
        render(<AuthPlayground />);
        const user = userEvent.setup();

        await user.click(await screen.findByRole("button", { name: "Sign out" }));
        expect(await screen.findByRole("form", { name: "Sign in" })).toBeInTheDocument();
    });
});
