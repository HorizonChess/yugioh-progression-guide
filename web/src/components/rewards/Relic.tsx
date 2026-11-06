"use client";

import { useState } from "react";
import type { PrizeId } from "@/lib/rewards";
import { LOCK, relicFor } from "@/components/rewards/relics";

/** A prize's relic. One drawing per mount (its gradients carry unique ids), kept across renders. */
export default function Relic({ prizeId, locked = false }: { prizeId: PrizeId; locked?: boolean }) {
    const [svg] = useState(() => relicFor(prizeId) + (locked ? LOCK : ""));
    return <span style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
