"use client";

import { useWelcome } from "@/lib/guide/welcome";
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
import GuestSavesImport from "./GuestSavesImport";

interface SaveSlotListProps {
    onSaveSelect?: (saveId: string) => void;
}


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
    // The new run's choices, explained the first time the form opens.
    useWelcome("new-run", isCreating, { account: remote ? "member" : "guest" });

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
        <div className="slots">
            <div className="slots__head">
                <h2>{remote ? "Your Series" : "Your Runs"}</h2>
                {!isCreating && (
                    <button type="button" data-guide="new-game" className="slots__new" onClick={() => setIsCreating(true)}>
                        + New Game
                    </button>
                )}
            </div>

            {remote && <GuestSavesImport />}

            {invites.map((invite) => (
                <Link key={invite.id} href={`/join/?invite=${invite.id}`} className="slots__note slots__note--invite">
                    <b>{invite.from}</b> invites you to “{invite.series.name}” <span>View ›</span>
                </Link>
            ))}

            {shared && (
                <div role="status" className="slots__note">
                    <p>{shared.note ?? "Send your rival this invite link (copied):"}</p>
                    <input readOnly value={shared.link} onFocus={(e) => e.target.select()} aria-label="Invite link" className="slots__field" />
                    <button type="button" onClick={() => setShared(null)} className="slots__quiet">Done</button>
                </div>
            )}

            {isCreating && (
                <form onSubmit={handleCreate} className="slots__form animate-in fade-in slide-in-from-top-2">
                    <label className="slots__label" htmlFor="run-name">Name</label>
                    <input id="run-name" type="text" value={newSaveName} onChange={(e) => setNewSaveName(e.target.value)} placeholder="Name your run" className="slots__field" autoFocus />

                    {remote && (
                        <>
                            <label className="slots__label" htmlFor="series-mode">Mode</label>
                            <select id="series-mode" value={mode} onChange={(e) => setMode(e.target.value as SeriesMode)} className="slots__field">
                                <option value="solo">Solo</option>
                                <option value="duo">Duo (invite a rival)</option>
                            </select>
                        </>
                    )}

                    {mode === "duo" && (
                        <>
                            <label className="slots__label" htmlFor="rival-name">Rival&apos;s duelist name (optional)</label>
                            <input id="rival-name" type="text" value={rivalName} onChange={(e) => setRivalName(e.target.value)} placeholder="Or share a link after creating" className="slots__field" />
                        </>
                    )}

                    <label className="slots__label" htmlFor="start-set">Starting set</label>
                    <select id="start-set" value={startSetIndex} onChange={(e) => setStartSetIndex(Number(e.target.value))} className="slots__field">
                        {sets.map((set, idx) => (
                            <option key={`${set.set_code}-${idx}`} value={idx}>
                                {set.set_name} ({set.tcg_date})
                            </option>
                        ))}
                    </select>

                    <label className="slots__label" htmlFor="packs-per-set">Packs per set</label>
                    <select id="packs-per-set" value={packsPerSet} onChange={(e) => setPacksPerSet(Number(e.target.value))} className="slots__field">
                        {PACKS_PER_SET_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>

                    <div className="slots__actions">
                        <button type="button" onClick={() => setIsCreating(false)} className="slots__quiet">Cancel</button>
                        <button type="submit" className="slots__create" disabled={!newSaveName.trim()}>Create</button>
                    </div>
                </form>
            )}

            <div className="slots__list custom-scrollbar">
                {saves.length === 0 && !isCreating && <p className="slots__empty">No runs yet. Start a new game!</p>}

                {saves.map((save) => (
                    <div key={save.id} className="slots__run">
                        <button type="button" onClick={() => handleLoad(save.id)} className="block w-full text-left group relative">
                            <div className="menu-item menu-item--active">
                                <div className="menu-item__words">
                                    <h3>{save.name}</h3>
                                    <p>
                                        {save.mode === "duo" ? `${duoLine(save)} · ` : ""}
                                        {save.currentSetName ?? sets[save.currentSetIndex]?.set_name ?? "Finished"}
                                    </p>
                                    <p className="slots__date">Last played {new Date(save.lastPlayed).toLocaleDateString()}</p>
                                </div>
                            </div>
                        </button>
                        {save.status === "awaiting_rival" && save.ownerId === userId && (
                            <button type="button" onClick={() => void shareLink(save.id)} className="slots__quiet slots__share">
                                Copy invite link
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={(e) => handleDelete(e, save)}
                            className="slots__delete"
                            title={save.mode === "duo" && save.members.length > 1 ? "Leave Series" : "Delete Save"}
                            aria-label={save.mode === "duo" && save.members.length > 1 ? `Leave ${save.name}` : `Delete ${save.name}`}
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
