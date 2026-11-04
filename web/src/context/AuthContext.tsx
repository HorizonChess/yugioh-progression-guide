"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { PublicUser } from "@ygo/shared";
import { getMe, signOut as signOutRequest } from "@/lib/auth-client";

interface AuthContextType {
    /** The signed-in account, or null for a guest. */
    user: PublicUser | null;
    loading: boolean;
    /** Records an account the sign-in forms just signed into. */
    signedIn: (user: PublicUser) => void;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<PublicUser | null>(null);
    const [loading, setLoading] = useState(true);
    // Re-checked on reaching the title or the menu, so signing in elsewhere shows up there.
    const pathname = usePathname();
    const checkpoint = pathname === "/" ? "title" : pathname.startsWith("/menu") ? "menu" : "game";

    useEffect(() => {
        let cancelled = false;
        void getMe().then((me) => {
            if (cancelled) return;
            setUser((prev) => (prev?.id === me?.id ? prev : me));
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [checkpoint]);

    const signOut = async () => {
        await signOutRequest();
        setUser(null);
    };

    return <AuthContext.Provider value={{ user, loading, signedIn: setUser, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
}
