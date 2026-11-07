"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PENDING_JOIN_KEY } from "@/lib/duo-client";
import { asset } from '@/lib/utils';
import SaveSlotList from "@/components/layout/SaveSlotList";
import { useAuth } from "@/context/AuthContext";
import { useProgression } from "@/context/ProgressionContext";
import GuideSprite from "@/components/layout/GuideSprite";
import { useWelcome } from "@/lib/guide/welcome";
import MenuItem, { MenuItemData } from "@/components/menu/MenuItem";
import MenuSignIn from "@/components/menu/MenuSignIn";
import MenuOptions from "@/components/menu/MenuOptions";

/**
 * The main MENU (route: /menu), on the hieroglyph wall: slanted lacquer tablets
 * on the left (Campaign flips to the save-slot list), Yugi in the torchlight on
 * the right (above the menu on phones), and a status footer. SIGN IN and SIGN
 * OUT stay here; BACK TO TITLE goes to the title screen (/), where new players
 * sign up.
 */
export default function Menu() {
    const [view, setView] = useState<"menu" | "saves" | "signin" | "options">("menu");
    const { activeSeriesId } = useProgression();
    const { user, loading, signOut } = useAuth();
    const router = useRouter();

    // A join link opened while signed out picks up again once signed in.
    useEffect(() => {
        if (loading || !user) return;
        let code: string | null = null;
        try {
            code = sessionStorage.getItem(PENDING_JOIN_KEY);
            sessionStorage.removeItem(PENDING_JOIN_KEY);
        } catch {
            // Storage blocked: there's nothing to resume.
        }
        if (code) router.replace(`/join/?code=${encodeURIComponent(code)}`);
    }, [loading, user, router]);

    const account: MenuItemData[] = !user
        ? [{ label: "SIGN IN", action: () => setView("signin"), description: "Keep your progress in an account", guide: "account" }]
        : [{ label: "SIGN OUT", action: () => void signOut(), description: `Signed in as ${user.duelistName}`, guide: "account" }];
    const menuItems: MenuItemData[] = loading
        ? []
        : [
              { label: "CAMPAIGN MODE", action: () => setView("saves"), description: user ? "Continue your progression journey" : "Playing as a guest, on this device" },
              {
                  label: "CARD COLLECTION",
                  href: "/collection",
                  description: activeSeriesId ? "View your acquired cards" : "Pick a save in Campaign Mode first",
                  disabled: !activeSeriesId,
              },
              { label: "OPTIONS", action: () => setView("options"), description: "Sound and the guide", guide: "options" },
              ...account,
              { label: "BACK TO TITLE", href: "/", description: user ? "Return to the title screen" : "Return to the title screen, to sign up or play as a guest" },
          ];

    // Yugi's hello on the main menu, then a word on Campaign Mode's list the first time it opens.
    useWelcome("menu", !loading && view === "menu", { account: user ? "member" : "guest" });
    useWelcome("campaign", view === "saves", { account: user ? "member" : "guest" });

    return (
        <main className="menu-screen">
            {/* No nav here: the menu is a front-end screen. */}
            <div className={`menu-screen__body ${view !== "menu" ? "menu-screen__body--form" : ""}`}>
                {/* Yugi in the torchlight: cut out of his black, his own shadow on the wall */}
                <div className="menu-yugi" aria-hidden="true">
                    <img src={asset("/sprites/yugi_menu.webp")} alt="" />
                    <span className="menu-yugi__glow" />
                </div>

                {/* The menu, or the save-slot list once Campaign is chosen */}
                <div className="menu-screen__left">
                    <div className="menu-word">
                        <small>The road through history</small>
                        <b>Progression Series</b>
                    </div>
                    {view !== "menu" ? (
                        <div className="menu-form animate-in slide-in-from-left-10 fade-in duration-300">
                            <button onClick={() => setView("menu")} className="menu-back">‹ Back to the menu</button>
                            {view === "saves" ? <SaveSlotList /> : view === "options" ? <MenuOptions /> : <MenuSignIn onDone={() => setView("menu")} />}
                        </div>
                    ) : (
                        <div className="menu-items animate-in slide-in-from-left-10 fade-in duration-300">
                            {menuItems.map((item, idx) =>
                                item.href ? (
                                    <Link key={idx} data-guide={item.guide} href={item.disabled ? "#" : item.href} className={`block group relative ${item.disabled ? "cursor-not-allowed" : ""}`} aria-disabled={item.disabled || undefined}>
                                        <MenuItem item={item} main={idx === 0} />
                                    </Link>
                                ) : (
                                    <button key={idx} data-guide={item.guide} onClick={item.action} disabled={item.disabled} className={`block w-full text-left group relative ${item.disabled ? "cursor-not-allowed" : ""}`}>
                                        <MenuItem item={item} main={idx === 0} />
                                    </button>
                                )
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="menu-screen__foot">
                <span>System · Online</span>
                <span>Version 0.6 Alpha</span>
            </div>
            {/* Just his tablet: he's already painted beside the menu. */}
            <GuideSprite bare />
        </main>
    );
}
