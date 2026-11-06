"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { packInFlight } from "@/lib/pack-flight";

export default function Template({ children }: { children: React.ReactNode }) {
    // A pack flying in from the timeline lands on the pack screen's own pack, so
    // that page only fades in: sliding it would move the pack out from under it.
    const [still] = useState(() => typeof window !== "undefined" && packInFlight());
    return (
        <motion.div
            className="h-full"
            initial={still ? { opacity: 0 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ ease: "easeInOut", duration: 0.5 }}
        >
            {children}
        </motion.div>
    );
}
