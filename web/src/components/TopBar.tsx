"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function TopBar() {
    const [duelistName, setDuelistName] = useState("Duelist");

    useEffect(() => {
        setDuelistName(localStorage.getItem("duelistName") || "Duelist");
    }, []);

    return (
        <div className="sticky top-0 z-50 bg-gradient-to-b from-gray-900 to-black border-b-2 border-gray-700 p-3 flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-4">
                <Link href="/menu" className="group flex items-center gap-4 hover:opacity-80 transition-opacity">
                    <div className="w-10 h-10 bg-gray-800 rounded-full border-2 border-[var(--primary)] flex items-center justify-center overflow-hidden group-hover:shadow-[0_0_10px_var(--primary)] transition-shadow">
                        <div className="w-full h-full bg-[var(--primary)]/20"></div>
                    </div>
                    <div>
                        <h2 className="text-[var(--primary)] font-bold text-lg tracking-wider uppercase leading-none">{duelistName}</h2>
                        <p className="text-[10px] text-gray-500 font-mono">ID: 8492-001</p>
                    </div>
                </Link>
            </div>

            <div className="flex items-center gap-6">
                <div className="hidden md:flex gap-4 text-xs font-bold tracking-widest text-gray-500">
                    <Link href="/map" className="hover:text-white transition-colors">CAMPAIGN</Link>
                    <Link href="/collection" className="hover:text-white transition-colors">COLLECTION</Link>
                    <Link href="/menu" className="hover:text-white transition-colors">MENU</Link>
                </div>
                <div className="text-right">
                    <h1 className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                        PROGRESSION
                    </h1>
                </div>
            </div>
        </div>
    );
}
