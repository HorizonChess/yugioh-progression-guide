"use client";

import { useEffect } from "react";

interface ModalProps {
    /** Called on Escape, backdrop click, or the built-in close button. */
    onClose: () => void;
    children: React.ReactNode;
    /**
     * Classes for the inner panel (the box that stops propagation). Callers
     * own their panel's look — width, background, border, layout — so this
     * primitive stays chrome-agnostic. Defaults to CardDetailModal's shell.
     */
    panelClassName?: string;
    /** Show the built-in ✕ close button (top-right of the panel). */
    showCloseButton?: boolean;
}

/**
 * The shared modal overlay the app's dialogs used to hand-roll: a fixed,
 * backdrop-blurred scrim (`fixed inset-0 z-50 … bg-black/80`) that fades in,
 * closes on Escape / backdrop click, and locks body scroll while open. The
 * inner panel zooms in and swallows clicks so only the backdrop dismisses.
 *
 * Extracted from CardDetailModal (the most complete hand-rolled version) so
 * every reward dialog and existing modal can host inside one primitive.
 */
export default function Modal({
    onClose,
    children,
    panelClassName = "relative w-full max-w-4xl bg-card-bg border border-divider rounded-xl shadow-2xl overflow-hidden flex flex-col md:flex-row",
    showCloseButton = false,
}: ModalProps) {
    // Close on Escape.
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    // Lock body scroll while the modal is open.
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "unset";
        };
    }, []);

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className={`${panelClassName} animate-in zoom-in-95 duration-200`}
                onClick={(e) => e.stopPropagation()}
            >
                {showCloseButton && (
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-black/50 rounded-full text-white hover:bg-white/20 transition-colors"
                    >
                        ✕
                    </button>
                )}
                {children}
            </div>
        </div>
    );
}
