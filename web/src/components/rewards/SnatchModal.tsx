"use client";

import { useEffect, useState } from "react";
import { fetchCardsByIds, type Card } from "@/lib/api";
import { parseCollectionKey, type Collection } from "@/lib/collection";
import { useCardTooltip } from "@/hooks/useCardTooltip";
import Modal from "@/components/ui/Modal";
import CardTooltip from "@/components/card/CardTooltip";
import CollectionCard from "@/components/collection/CollectionCard";
import FrameButton from "@/components/ui/FrameButton";

interface Printing {
    key: string;
    card: Card;
    rarity: string;
    setCode: string;
    count: number;
}

interface SnatchModalProps {
    /** The rival's binder: copy counts by collection key. */
    loadBinder: () => Promise<Collection>;
    /** Takes one copy of the picked printing. */
    onChoose: (printing: string) => void;
    onClose: () => void;
}

/** Snatch Steal: pick any card from the rival's binder and get a copy; the rival keeps theirs. */
export default function SnatchModal({ loadBinder, onChoose, onClose }: SnatchModalProps) {
    const [printings, setPrintings] = useState<Printing[] | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [pending, setPending] = useState<Printing | null>(null);
    const { hoveredCard, tooltipPosition, onHover, onLeave } = useCardTooltip();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const binder = await loadBinder();
                const entries = Object.entries(binder).flatMap(([key, count]) => {
                    const entry = parseCollectionKey(key);
                    return entry && count > 0 ? [{ key, count, ...entry }] : [];
                });
                const cards = new Map((await fetchCardsByIds(entries.map((e) => e.id))).map((c) => [c.id, c]));
                const shown = entries.flatMap(({ key, count, id, setCode, rarity }) => {
                    const card = cards.get(id);
                    return card ? [{ key, card, count, setCode, rarity }] : [];
                });
                if (!cancelled) setPrintings(shown.sort((a, b) => a.card.name.localeCompare(b.card.name)));
            } catch (error) {
                if (!cancelled) setFailed(error instanceof Error ? error.message : "Couldn't open your rival's binder.");
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- read the binder once, when opened
    }, []);

    const panelClassName = "relative w-full max-w-6xl h-[85vh] max-h-[820px] bg-card-bg border border-divider rounded-xl shadow-2xl overflow-hidden flex flex-col";

    return (
        <Modal onClose={onClose} panelClassName={panelClassName} showCloseButton>
            {hoveredCard && <CardTooltip card={hoveredCard} x={tooltipPosition.x} y={tooltipPosition.y} />}
            <div className="shrink-0 px-6 py-4 border-b border-white/10">
                <h2 className="text-2xl font-black text-white">Snatch Steal</h2>
                <p className="text-primary text-sm font-bold">Pick any card in your rival&apos;s binder to get a copy of it.</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-6">
                {failed ? (
                    <p className="text-white/70 text-center">{failed}</p>
                ) : !printings ? (
                    <p className="text-xl animate-pulse text-white/80 text-center">Opening the binder…</p>
                ) : printings.length === 0 ? (
                    <p className="text-white/70 text-center">Your rival&apos;s binder is empty.</p>
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                        {printings.map((p) => (
                            <div key={p.key} className={pending?.key === p.key ? "ring-2 ring-primary rounded" : ""}>
                                <CollectionCard
                                    card={p.card}
                                    count={p.count}
                                    rarity={`${p.rarity} · ${p.setCode}`}
                                    onSelect={() => setPending(p)}
                                    onHover={(e) => onHover(p.card, e)}
                                    onLeave={onLeave}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {pending && (
                <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-t border-white/10 bg-black/30">
                    <div className="min-w-0">
                        <p className="text-white font-bold truncate">{pending.card.name}</p>
                        <p className="text-white/60 text-xs uppercase tracking-wide">{pending.rarity}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            onClick={() => setPending(null)}
                            className="h-11 px-5 rounded-lg border border-white/20 text-white/80 hover:bg-white/10 transition-colors text-sm font-bold uppercase tracking-wider"
                        >
                            Cancel
                        </button>
                        <FrameButton onClick={() => onChoose(pending.key)} className="h-11 px-5" textClassName="tracking-[0.1em] text-[0.72rem]">
                            Snatch It
                        </FrameButton>
                    </div>
                </div>
            )}
        </Modal>
    );
}
