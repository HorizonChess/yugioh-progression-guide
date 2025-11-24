"use client";

import { useProgression } from "@/context/ProgressionContext";
import { fetchCardsByIds, Card } from "@/lib/api";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function CollectionPage() {
    const { collection } = useProgression();
    const [cards, setCards] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadCollection() {
            const ids = Object.keys(collection).map(Number);
            if (ids.length > 0) {
                // Fetch in batches if needed, but for now fetch all (API might have limits, but usually handles ~100s okay)
                // If collection is huge, we need pagination. For MVP, we'll try fetching all.
                // Note: YGOPRODECK API might error if URL is too long.
                // Let's fetch in chunks of 50 if needed, but start simple.
                const fetchedCards = await fetchCardsByIds(ids);
                setCards(fetchedCards);
            }
            setLoading(false);
        }
        loadCollection();
    }, [collection]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-xl animate-pulse">Loading Collection...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-3xl font-bold text-white">My Collection</h1>
                    <Link href="/" className="text-[var(--primary)] hover:underline">
                        Back to Dashboard
                    </Link>
                </div>

                {cards.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed border-[var(--border)] rounded-xl bg-white/5">
                        <div className="text-6xl mb-4">🎴</div>
                        <h2 className="text-2xl font-bold mb-2">Collection Empty</h2>
                        <p className="text-gray-400">Open some packs to start your collection!</p>
                        <Link
                            href="/map"
                            className="inline-block mt-4 px-6 py-2 bg-[var(--primary)] text-black font-bold rounded-lg hover:bg-[var(--primary-hover)] transition-colors"
                        >
                            Go to Campaign Map
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                        {cards.map((card) => (
                            <div key={card.id} className="relative group aspect-[59/86]">
                                <img
                                    src={card.card_images[0].image_url}
                                    alt={card.name}
                                    className="w-full h-full object-contain rounded-lg shadow-lg"
                                    loading="lazy"
                                />
                                <div className="absolute bottom-0 right-0 bg-black/80 text-white px-2 py-1 rounded-tl-lg font-bold border-t border-l border-white/20">
                                    x{collection[card.id]}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
