"use client";

import Link from "next/link";
import { useState } from "react";
import SaveSlotList from "@/components/shell/SaveSlotList.view";
import MenuItem, { MenuItemData } from "@/components/Menu/MenuItem.view";

/**
 * The main MENU (route: /menu). A retro terminal-styled screen: skewed menu
 * entries on the left (Campaign flips to the save-slot list), character art on
 * the right, and a status footer.
 */
export default function Menu() {
    const [view, setView] = useState<"menu" | "saves">("menu");

    const menuItems: MenuItemData[] = [
        { label: "CAMPAIGN MODE", action: () => setView("saves"), description: "Continue your progression journey" },
        { label: "CARD COLLECTION", href: "/collection", description: "View your acquired cards" },
        { label: "OPTIONS", href: "#", description: "Configure game settings", disabled: true },
        { label: "EXIT GAME", href: "/", description: "Return to title screen" },
    ];

    return (
        <main className="min-h-screen bg-black text-white grid grid-rows-[1fr_auto] relative overflow-hidden font-mono">
            <div className="menu-grid-bg" />

            {/* No nav here — the menu is a front-end screen, like onboarding. */}
            <div className="relative z-10 flex items-center justify-center p-8">
                <div className="flex gap-12 w-full max-w-6xl items-center">
                    {/* Left: menu, or the save-slot list once Campaign is chosen */}
                    <div className="flex-1 space-y-4">
                        {view === "saves" ? (
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
                            src="/sprites/yugi_v2.png"
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
