"use client";

import { alertRepoError, useProgression } from "@/context/ProgressionContext";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";
import { PACKS_PER_SET_OPTIONS } from "@ygo/shared";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchAllSets, CardSet } from "@/lib/api";
import { inviteLink, inviteRival } from "@/lib/duo-client";
import type { SeriesMode, SeriesSummary } from "@/lib/repo/types";

interface SaveSlotListProps {
    onSaveSelect?: (saveId: string) => void;
}

const field = "w-full bg-black border border-gray-700 p-2 text-white text-sm focus:border-[var(--primary)] outline-none";
const label = "text-xs text-gray-500 uppercase font-bold block mb-1";

export default function SaveSlotList({ onSaveSelect }: SaveSlotListProps) {
    const { seriesList: saves, createSeries, loadSeries, deleteSeries, repo } = useProgression();
    const userId = useAuth().user?.id;
    const { invites } = useNotifications();
    const router = useRouter();
    const [isCreating, setIsCreating] = useState(false);
    const [newSaveName, setNewSaveName] = useState("");
    const [startSetIndex, setStartSetIndex] = useState(0);
    const [packsPerSet, setPacksPerSet] = useState(24);
    const [mode, setMode] = useState<SeriesMode>("solo");
    const [rivalName, setRivalName] = useState("");
    /** A fresh invite link to show, with which series it's for. */
    const [shared, setShared] = useState<{ seriesId: string; link: string; note?: string } | null>(null);
    const [sets, setSets] = useState<CardSet[]>([]);
    const remote = repo.kind === "remote";

    useEffect(() => {
        fetchAllSets().then(setSets);
    }, []);

    const shareLink = async (seriesId: string, note?: string) => {
        try {
            const { code } = await inviteRival(seriesId);
            const link = inviteLink(code!);
            setShared({ seriesId, link, ...(note ? { note } : {}) });
            await navigator.clipboard?.writeText(link).catch(() => undefined);
        } catch (error) {
            alertRepoError(error);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSaveName.trim()) return;
        let id: string;
        try {
            id = await createSeries({ name: newSaveName.trim(), startSetIndex, packsPerSet, mode });
        } catch (error) {
            return alertRepoError(error);
        }
        setNewSaveName("");
        setStartSetIndex(0);
        setIsCreating(false);
        if (mode !== "duo") return;
        // The series exists either way; a name that doesn't work still leaves the link to share.
        let note: string | undefined;
        if (rivalName.trim()) {
            note = await inviteRival(id, rivalName.trim()).then(
                ({ invite }) => `${invite!.to} has been invited. Or share this link:`,
                (error: unknown) => `${error instanceof Error ? error.message : "That invite didn't go through"}. Share this link instead:`,
            );
        }
        setRivalName("");
        await shareLink(id, note);
    };

    const handleLoad = async (id: string) => {
        await loadSeries(id).catch(alertRepoError);
        if (onSaveSelect) {
            onSaveSelect(id);
        } else {
            router.push('/timeline');
        }
    };

    const handleDelete = (e: React.MouseEvent, save: SeriesSummary) => {
        e.stopPropagation();
        const question =
            save.mode === "duo" && save.members.length > 1
                ? "Leave this duo series? Your cards in it are lost, and the series pauses for your rival."
                : "Are you sure you want to delete this save file?";
        if (confirm(question)) deleteSeries(save.id).catch(alertRepoError);
    };

    /** How a duo series stands, from this player's side. */
    const duoLine = (save: SeriesSummary) => {
        const rival = save.members.find((m) => m.id !== userId);
        if (save.status === "awaiting_rival") return "Duo · waiting for a rival";
        if (save.status === "paused") return "Duo · paused, your rival left";
        return `Duo vs ${rival?.duelistName ?? "?"}`;
    };

    return (
        <div className="w-full max-w-md space-y-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white uppercase tracking-widest">{remote ? "Your Series" : "Select Save File"}</h3>
                <button
                    onClick={() => setIsCreating(true)}
                    className="text-xs bg-[var(--primary)] text-black px-3 py-1 rounded font-bold hover:bg-yellow-400 transition-colors"
                >
                    + NEW GAME
                </button>
            </div>

            {invites.map((invite) => (
                <Link
                    key={invite.id}
                    href={`/join/?invite=${invite.id}`}
                    className="block bg-gray-900 border border-[var(--primary)] p-3 text-sm text-white hover:bg-gray-800"
                >
                    <strong>{invite.from}</strong> invites you to “{invite.series.name}” <span className="text-[var(--primary)]">▶ View</span>
                </Link>
            ))}

            {shared && (
                <div role="status" className="bg-gray-900 border border-gray-700 p-3 text-xs text-gray-300 space-y-2">
                    <p>{shared.note ?? "Send your rival this invite link (copied):"}</p>
                    <input readOnly value={shared.link} onFocus={(e) => e.target.select()} aria-label="Invite link" className={field} />
                    <button type="button" onClick={() => setShared(null)} className="text-gray-500 hover:text-white">Done</button>
                </div>
            )}

            {isCreating && (
                <form onSubmit={handleCreate} className="bg-gray-900 p-4 rounded border border-[var(--primary)] mb-4 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-3">
                        <div>
                            <label className={label}>Name</label>
                            <input
                                type="text"
                                value={newSaveName}
                                onChange={(e) => setNewSaveName(e.target.value)}
                                placeholder="Enter Name..."
                                className={field}
                                autoFocus
                            />
                        </div>

                        {remote && (
                            <div>
                                <label className={label} htmlFor="series-mode">Mode</label>
                                <select id="series-mode" value={mode} onChange={(e) => setMode(e.target.value as SeriesMode)} className={field}>
                                    <option value="solo">Solo</option>
                                    <option value="duo">Duo (invite a rival)</option>
                                </select>
                            </div>
                        )}

                        {mode === "duo" && (
                            <div>
                                <label className={label} htmlFor="rival-name">Rival&apos;s duelist name (optional)</label>
                                <input
                                    id="rival-name"
                                    type="text"
                                    value={rivalName}
                                    onChange={(e) => setRivalName(e.target.value)}
                                    placeholder="Or share a link after creating"
                                    className={field}
                                />
                            </div>
                        )}

                        <div>
                            <label className={label} htmlFor="start-set">Starting Set</label>
                            <select
                                id="start-set"
                                value={startSetIndex}
                                onChange={(e) => setStartSetIndex(Number(e.target.value))}
                                className={field}
                            >
                                {sets.map((set, idx) => (
                                    <option key={`${set.set_code}-${idx}`} value={idx}>
                                        {set.set_name} ({set.tcg_date})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className={label} htmlFor="packs-per-set">Packs per Set</label>
                            <select
                                id="packs-per-set"
                                value={packsPerSet}
                                onChange={(e) => setPacksPerSet(Number(e.target.value))}
                                className={field}
                            >
                                {PACKS_PER_SET_OPTIONS.map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-2 justify-end mt-4">
                        <button
                            type="button"
                            onClick={() => setIsCreating(false)}
                            className="text-xs text-gray-400 hover:text-white px-3 py-1"
                        >
                            CANCEL
                        </button>
                        <button
                            type="submit"
                            className="text-xs bg-[var(--primary)] text-black px-3 py-1 rounded font-bold hover:bg-yellow-400"
                        >
                            CREATE
                        </button>
                    </div>
                </form>
            )}

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {saves.length === 0 && !isCreating && (
                    <div className="text-center text-gray-500 py-8 border border-dashed border-gray-800 rounded">
                        No save files found.
                        <br />
                        Start a new game!
                    </div>
                )}

                {saves.map((save) => (
                    <div
                        key={save.id}
                        onClick={() => handleLoad(save.id)}
                        className="group relative bg-gray-900 border border-gray-800 hover:border-[var(--primary)] p-4 cursor-pointer transition-all hover:translate-x-2"
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-bold text-[var(--primary)] text-lg">{save.name}</h4>
                                {save.mode === "duo" && <p className="text-xs text-white">{duoLine(save)}</p>}
                                <p className="text-xs text-gray-400">
                                    Set: {save.currentSetName ?? sets[save.currentSetIndex]?.set_name ?? "Finished"}
                                </p>
                                <p className="text-[10px] text-gray-600 mt-1">
                                    Last Played: {new Date(save.lastPlayed).toLocaleDateString()}
                                </p>
                                {save.status === "awaiting_rival" && save.ownerId === userId && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            void shareLink(save.id);
                                        }}
                                        className="mt-2 text-xs text-[var(--primary)] hover:underline"
                                    >
                                        Copy invite link
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={(e) => handleDelete(e, save)}
                                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-500 transition-opacity p-1"
                                title={save.mode === "duo" && save.members.length > 1 ? "Leave Series" : "Delete Save"}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Selection Indicator */}
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                ))}
            </div>
        </div>
    );
}
