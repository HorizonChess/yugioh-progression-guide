"use client";

import { useRouter } from "next/navigation";
import { alertRepoError, useProgression } from "@/context/ProgressionContext";
import { duelPath } from "@/lib/duel-client";
import type { AppNotification } from "@/lib/duo-client";

/** Duels a notification leads straight into (one still open). */
const intoDuel = (n: AppNotification) =>
    n.type === "duel-challenge" || n.type === "duel-accepted" || n.type === "duel-turn" || (n.type === "duel-call-off" && !n.payload.done);

/** Opens a notification where it's answered: from the bell, or from a tap on its push. */
export function useOpenNotification() {
    const { loadSeries } = useProgression();
    const router = useRouter();
    return async (n: AppNotification) => {
        if (n.type === "invite") return router.push(`/join/?invite=${n.payload.inviteId}`);
        try {
            await loadSeries(n.seriesId);
        } catch (error) {
            return alertRepoError(error);
        }
        if (intoDuel(n) && typeof n.payload.duelId === "string") return router.push(duelPath(n.payload.duelId));
        router.push(n.type === "report" ? "/record-match" : n.type === "report-confirmed" || n.type === "duel-result" ? "/rewards" : "/timeline");
    };
}
