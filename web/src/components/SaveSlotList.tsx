"use client";

import { useProgression } from "@/context/ProgressionContext";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchAllSets, CardSet } from "@/lib/api";

export default function SaveSlotList() {
    const { saves, createSave, loadSave, deleteSave } = useProgression();
    const router = useRouter();
    const [isCreating, setIsCreating] = useState(false);
    const [newSaveName, setNewSaveName] = useState("");
    const [startSetIndex, setStartSetIndex] = useState(0);
    const [sets, setSets] = useState<CardSet[]>([]);

    useEffect(() => {
        fetchAllSets().then(setSets);
    }, []);

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSaveName.trim()) return;
        createSave(newSaveName, startSetIndex);
        setNewSaveName("");
        setStartSetIndex(0);
        setIsCreating(false);
    };

    const handleLoad = (id: string) => {
        loadSave(id);
        router.push('/map');
    };

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        deleteSave(id);
    };

    return (
        <div className="w-full max-w-md space-y-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white uppercase tracking-widest">Select Save File</h3>
                <button
                    onClick={() => setIsCreating(true)}
                    className="text-xs bg-[var(--primary)] text-black px-3 py-1 rounded font-bold hover:bg-yellow-400 transition-colors"
                >
                    + NEW GAME
                </button>
            </div>

            {isCreating && (
                <form onSubmit={handleCreate} className="bg-gray-900 p-4 rounded border border-[var(--primary)] mb-4 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-gray-500 uppercase font-bold block mb-1">Duelist Name</label>
                            <input
                                type="text"
                                value={newSaveName}
                                onChange={(e) => setNewSaveName(e.target.value)}
                                placeholder="Enter Name..."
                                className="w-full bg-black border border-gray-700 p-2 text-white text-sm focus:border-[var(--primary)] outline-none"
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="text-xs text-gray-500 uppercase font-bold block mb-1">Starting Set</label>
                            <select
                                value={startSetIndex}
                                onChange={(e) => setStartSetIndex(Number(e.target.value))}
                                className="w-full bg-black border border-gray-700 p-2 text-white text-sm focus:border-[var(--primary)] outline-none"
                            >
                                {sets.map((set, idx) => (
                                    <option key={`${set.set_code}-${idx}`} value={idx}>
                                        {set.set_name} ({set.tcg_date})
                                    </option>
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
                                <p className="text-xs text-gray-400">
                                    Set: {sets[save.currentSetIndex]?.set_name || `Set ${save.currentSetIndex + 1}`}
                                </p>
                                <p className="text-[10px] text-gray-600 mt-1">
                                    Last Played: {new Date(save.lastPlayed).toLocaleDateString()}
                                </p>
                            </div>
                            <button
                                onClick={(e) => handleDelete(e, save.id)}
                                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-500 transition-opacity p-1"
                                title="Delete Save"
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
