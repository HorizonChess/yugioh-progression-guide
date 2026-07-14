import { SavedDeck } from "@/context/ProgressionContext";

interface LoadDeckModalProps {
    savedDecks: SavedDeck[];
    onLoad: (deck: SavedDeck) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
}

export default function LoadDeckModal({ savedDecks, onLoad, onDelete, onClose }: LoadDeckModalProps) {
    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 border-2 border-slate-500 rounded-xl p-6 w-full max-w-md shadow-2xl">
                <h2 className="text-2xl font-bold mb-4 text-amber-400 font-russo">Load Deck</h2>
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto custom-scrollbar p-1">
                    {savedDecks.length === 0 && <p className="text-gray-400 italic text-center">No saved decks found.</p>}
                    {savedDecks.map(deck => {
                        const isInvalid = deck.mainDeck.length < 40;
                        return (
                            <div key={deck.id} className="flex justify-between items-center bg-slate-900 border border-slate-700 p-2 rounded hover:bg-slate-700 transition-colors group">
                                <button
                                    className="flex-1 text-left"
                                    onClick={() => onLoad(deck)}
                                >
                                    <div className={`font-bold ${isInvalid ? 'text-red-500' : 'text-white'}`}>
                                        {deck.name}
                                    </div>
                                    <span className="text-xs text-gray-400">
                                        {new Date(deck.createdAt).toLocaleDateString()} | {deck.mainDeck.length} Cards
                                    </span>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(deck.id); }}
                                    className="bg-red-900/50 hover:bg-red-600 text-red-200 p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    DELETE
                                </button>
                            </div>
                        )
                    })}
                </div>
                <button onClick={onClose} className="mt-4 w-full bg-slate-700 hover:bg-slate-600 py-2 rounded font-bold border border-slate-500">CANCEL</button>
            </div>
        </div>
    );
}
