"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { PublicUser } from "@ygo/shared";
import { getMe, signOut as signOutRequest } from "@/lib/auth-client";

interface AuthContextType {
    /** The signed-in account, or null for a guest. */
    user: PublicUser | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<PublicUser | null>(null);
    const [loading, setLoading] = useState(true);
    // Re-checked on reaching the menu, so signing in elsewhere shows up there.
    const onMenu = usePathname().startsWith("/menu");

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
    }, [onMenu]);

    const signOut = async () => {
        await signOutRequest();
        setUser(null);
    };

    return <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
}
