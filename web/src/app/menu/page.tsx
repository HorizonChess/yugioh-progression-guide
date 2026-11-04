"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { asset } from '@/lib/utils';
import SaveSlotList from "@/components/layout/SaveSlotList";
import { useAuth } from "@/context/AuthContext";
import { useProgression } from "@/context/ProgressionContext";
import MenuItem, { MenuItemData } from "@/components/menu/MenuItem";
import AccountPanel, { type AccountView, type Landing } from "@/components/onboarding/AccountPanel";
import { verifyEmail } from "@/lib/auth-client";

/**
 * The main MENU (route: /menu). A retro terminal-styled screen: skewed menu
 * entries on the left (Campaign flips to the save-slot list, Sign in / Sign up
 * to the account panel), character art on
 * the right, and a status footer.
 */
export default function Menu() {
    const [view, setView] = useState<"menu" | "saves" | "account">("menu");
    const [accountStart, setAccountStart] = useState<AccountView>("signin");
    const [landing, setLanding] = useState<Landing | undefined>(undefined);
    const [banner, setBanner] = useState<string | null>(null);
    const { activeSeriesId } = useProgression();
    const { user, loading, signOut } = useAuth();
    const router = useRouter();

    // Email links and the Google redirect land here with ?verify=, ?reset= or ?google=.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const verify = params.get("verify");
        const reset = params.get("reset") ?? undefined;
        const google = params.get("google") ?? undefined;
        if (!verify && !reset && !google) return;
        router.replace("/menu/");
        if (verify) void verifyEmail(verify).then((r) => setBanner(r.ok ? "Email confirmed. Thank you!" : r.message));
        if (google === "ok") void Promise.resolve().then(() => setBanner("Signed in with Google."));
        else if (reset || google) {
            void Promise.resolve().then(() => {
                setLanding({ reset, google });
                setView("account");
            });
        }
    }, [router]);

    const openAccount = (start: AccountView) => {
        setAccountStart(start);
        setLanding(undefined);
        setView("account");
    };

    const menuItems: MenuItemData[] = loading
        ? []
        : user
          ? [
                { label: "CAMPAIGN MODE", action: () => setView("saves"), description: "Continue your progression journey" },
                {
                    label: "CARD COLLECTION",
                    href: "/collection",
                    description: activeSeriesId ? "View your acquired cards" : "Pick a save in Campaign Mode first",
                    disabled: !activeSeriesId,
                },
                { label: "OPTIONS", href: "#", description: "Configure game settings", disabled: true },
                ...(user.role === "admin" ? [{ label: "DEV MODE", href: "#", description: "Coming soon", disabled: true }] : []),
                { label: "SIGN OUT", action: () => void signOut(), description: `Signed in as ${user.duelistName}` },
            ]
          : [
                { label: "SIGN IN", action: () => openAccount("signin"), description: "Present your invitation" },
                { label: "SIGN UP", action: () => openAccount("envelope"), description: "Answer the call to Duelist Kingdom" },
                { label: "PLAY AS GUEST", action: () => setView("saves"), description: "Play on this device without an account" },
                { label: "EXIT GAME", href: "/", description: "Return to title screen" },
            ];

    return (
        <main className="min-h-screen bg-black text-white grid grid-rows-[1fr_auto] relative overflow-hidden font-mono">
            <div className="menu-grid-bg" />

            {/* No nav here: the menu is a front-end screen. */}
            <div className="relative z-10 flex items-center justify-center p-8">
                <div className="flex gap-12 w-full max-w-6xl items-center">
                    {/* Left: menu, or the save-slot list once Campaign is chosen */}
                    <div className="flex-1 space-y-4">
                        {banner && view === "menu" && (
                            <p role="status" className="rounded border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">{banner}</p>
                        )}
                        {view === "account" ? (
                            <div className="animate-in slide-in-from-left-10 fade-in duration-300">
                                <AccountPanel key={accountStart} start={accountStart} landing={landing} onClose={() => setView("menu")} />
                            </div>
                        ) : view === "saves" ? (
                            <div className="animate-in slide-in-from-left-10 fade-in duration-300">
                                <button onClick={() => setView("menu")} className="mb-6 text-gray-500 hover:text-white flex items-center gap-2 transition-colors">
                                    ◀ BACK TO MENU
                                </button>
                                <SaveSlotList />
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in slide-in-from-left-10 fade-in duration-300">
                                {menuItems.map((item, idx) =>
                                    item.href ? (
                                        <Link key={idx} href={item.disabled ? "#" : item.href} className={`block group relative ${item.disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
                                            <MenuItem item={item} />
                                        </Link>
                                    ) : (
                                        <button key={idx} onClick={item.action} disabled={item.disabled} className={`block w-full text-left group relative ${item.disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
                                            <MenuItem item={item} />
                                        </button>
                                    )
                                )}
                            </div>
                        )}
                    </div>

                    {/* Right: character art (lg+ only) */}
                    <div className="flex-1 h-[600px] relative hidden lg:block">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--primary)_0%,transparent_70%)] opacity-5 animate-pulse" />
                        <img
                            src={asset("/sprites/yugi_v2.png")}
                            alt="Yugi"
                            className="absolute bottom-0 right-0 h-full object-contain drop-shadow-[0_0_50px_rgba(0,0,0,0.8)]"
                            style={{ maskImage: "linear-gradient(to bottom, black 80%, transparent 100%)" }}
                        />
                    </div>
                </div>
            </div>

            <div className="bg-gray-900 border-t border-gray-800 p-2 flex justify-between text-xs text-gray-500 font-mono uppercase">
                <span>SYSTEM: ONLINE</span>
                <span>VERSION 1.0.0</span>
            </div>
        </main>
    );
}
