"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SaveSlotList from "@/components/SaveSlotList";

export default function MenuPage() {
    const [duelistName, setDuelistName] = useState("");
    const [view, setView] = useState<'menu' | 'saves'>('menu');

    useEffect(() => {
        setDuelistName(localStorage.getItem("duelistName") || "Duelist");
    }, []);

    const menuItems = [
        { label: "CAMPAIGN MODE", action: () => setView('saves'), description: "Continue your progression journey" },
        { label: "CARD COLLECTION", href: "/collection", description: "View your acquired cards" },
        { label: "OPTIONS", href: "#", description: "Configure game settings", disabled: true },
        { label: "EXIT GAME", href: "/", description: "Return to title screen" },
    ];

    return (
        <main className="min-h-screen bg-black text-white flex flex-col relative overflow-hidden font-mono">
            {/* Retro Background Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a1a1a_1px,transparent_1px),linear-gradient(to_bottom,#1a1a1a_1px,transparent_1px)] bg-[size:40px_40px] opacity-20"></div>

            {/* Top Bar */}
            <div className="relative z-10 bg-gradient-to-b from-gray-900 to-black border-b-2 border-gray-700 p-4 flex justify-between items-center shadow-lg">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-800 rounded-full border-2 border-[var(--primary)] flex items-center justify-center overflow-hidden">
                        {/* Avatar Placeholder */}
                        <div className="w-full h-full bg-[var(--primary)]/20"></div>
                    </div>
                    <div>
                        <h2 className="text-[var(--primary)] font-bold text-xl tracking-wider uppercase">{duelistName}</h2>
                        <p className="text-xs text-gray-500">DUELIST ID: 8492-001</p>
                    </div>
                </div>
                <div className="text-right">
                    <h1 className="text-2xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                        PROGRESSION SERIES
                    </h1>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 relative z-10 flex items-center justify-center p-8">
                <div className="flex gap-12 w-full max-w-6xl items-center">

                    {/* Left Side: Menu or Back Button */}
                    <div className="flex-1 space-y-4">
                        {view === 'saves' ? (
                            <div className="animate-in slide-in-from-left-10 fade-in duration-300">
                                <button
                                    onClick={() => setView('menu')}
                                    className="mb-6 text-gray-500 hover:text-white flex items-center gap-2 transition-colors"
                                >
                                    ◀ BACK TO MENU
                                </button>
                                <SaveSlotList />
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in slide-in-from-left-10 fade-in duration-300">
                                {menuItems.map((item, idx) => (
                                    item.href ? (
                                        <Link
                                            key={idx}
                                            href={item.disabled ? "#" : item.href}
                                            className={`block group relative ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <MenuItemContent item={item} />
                                        </Link>
                                    ) : (
                                        <button
                                            key={idx}
                                            onClick={item.action}
                                            disabled={item.disabled}
                                            className={`block w-full text-left group relative ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            <MenuItemContent item={item} />
                                        </button>
                                    )
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Character/Art Area (Right Side) */}
                    <div className="flex-1 h-[600px] relative hidden lg:block">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--primary)_0%,transparent_70%)] opacity-5 animate-pulse"></div>
                        {/* Placeholder for dynamic character art */}
                        <img
                            src="/yugi_v2.png"
                            alt="Yugi"
                            className="absolute bottom-0 right-0 h-full object-contain drop-shadow-[0_0_50px_rgba(0,0,0,0.8)] mask-image-gradient"
                            style={{ maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)' }}
                        />
                    </div>
                </div>
            </div>

            {/* Footer Status Bar */}
            <div className="bg-gray-900 border-t border-gray-800 p-2 flex justify-between text-xs text-gray-500 font-mono uppercase">
                <span>SYSTEM: ONLINE</span>
                <span>VERSION 1.0.0</span>
            </div>
        </main>
    );
}

function MenuItemContent({ item }: { item: any }) {
    return (
        <div className={`
            relative overflow-hidden
            bg-gradient-to-r from-gray-900 to-black 
            border-l-4 ${item.disabled ? 'border-gray-700' : 'border-[var(--primary)]'} 
            p-6 skew-x-[-10deg] 
            transition-all duration-300
            ${!item.disabled && 'group-hover:translate-x-4 group-hover:bg-gray-800 group-hover:shadow-[0_0_20px_rgba(212,175,55,0.2)]'}
        `}>
            <div className="skew-x-[10deg] flex justify-between items-center">
                <div>
                    <h3 className={`text-2xl font-black tracking-widest ${item.disabled ? 'text-gray-500' : 'text-white group-hover:text-[var(--primary)]'}`}>
                        {item.label}
                    </h3>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mt-1 group-hover:text-gray-300">
                        {item.description}
                    </p>
                </div>
                {!item.disabled && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--primary)]">
                        ▶
                    </div>
                )}
            </div>
        </div>
    );
}
