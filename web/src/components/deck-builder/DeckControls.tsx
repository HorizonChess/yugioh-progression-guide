interface DeckControlsProps {
    deckName: string;
    onDeckNameChange: (name: string) => void;
    onSave: () => void;
    onLoad: () => void;
    onClear: () => void;
    onSort: () => void;
    onImport: () => void;
    onExport: () => void;
}

export default function DeckControls({
    deckName,
    onDeckNameChange,
    onSave,
    onLoad,
    onClear,
    onSort,
    onImport,
    onExport
}: DeckControlsProps) {
    return (
        // Raised control panel: deck-name field + 2-col grid of action buttons
        <div className="shrink-0 bg-surface-raised border border-gray-600 rounded m-1 p-2 flex flex-col gap-2 text-xs">
            <div className="flex gap-1">
                <input
                    value={deckName}
                    onChange={(e) => onDeckNameChange(e.target.value)}
                    className="bg-black/50 border border-gray-500 rounded px-2 py-1 flex-1 text-white font-bold"
                    placeholder="Deck Name"
                />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
                <button onClick={onSave} className="deck-control-btn">Save Deck</button>
                <button onClick={onLoad} className="deck-control-btn">Load Deck</button>
                <button onClick={onClear} className="deck-control-btn">Clear Deck</button>
                <button onClick={onSort} className="deck-control-btn">Sort</button>
                <button onClick={onImport} className="deck-control-btn">Import</button>
                <button onClick={onExport} className="deck-control-btn">Export</button>
            </div>
        </div>
    );
}
