"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { packInFlight } from "@/lib/pack-flight";
import { takeSwipe } from "@/lib/swipe-nav";

export default function Template({ children }: { children: React.ReactNode }) {
    // A pack flying in from the timeline lands on the pack screen's own pack, so
    // that page only fades in: sliding it would move the pack out from under it.
    const [still] = useState(() => typeof window !== "undefined" && packInFlight());
    // Reached by a swipe between tabs (phones): it slides in from the side the finger came from.
    const [swiped] = useState(() => (typeof window !== "undefined" ? takeSwipe() : 0));
    return (
        <motion.div
            className="h-full"
            initial={still ? { opacity: 0 } : swiped ? { opacity: 0, x: swiped * 48 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ ease: "easeInOut", duration: 0.5 }}
        >
            {children}
        </motion.div>
    );
}
