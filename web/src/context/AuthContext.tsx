"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicUser } from "@ygo/shared";
import { getMe } from "@/lib/auth-client";

interface AuthContextType {
    /** The signed-in account, or null for a guest. */
    user: PublicUser | null;
    loading: boolean;
    refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<PublicUser | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setUser(await getMe());
        setLoading(false);
    }, []);

    useEffect(() => {
        let cancelled = false;
        void getMe().then((me) => {
            if (cancelled) return;
            setUser(me);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return <AuthContext.Provider value={{ user, loading, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
}
