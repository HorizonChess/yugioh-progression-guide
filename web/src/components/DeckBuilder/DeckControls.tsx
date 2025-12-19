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
    const buttonClass = "bg-gradient-to-b from-gray-200 to-gray-400 text-black border border-gray-600 rounded shadow font-bold hover:brightness-110 py-1";

    return (
        <div className="shrink-0 bg-[#2d2d2d] border border-gray-600 rounded m-1 p-2 flex flex-col gap-2 text-xs">
            <div className="flex gap-1">
                <input
                    value={deckName}
                    onChange={(e) => onDeckNameChange(e.target.value)}
                    className="bg-black/50 border border-gray-500 rounded px-2 py-1 flex-1 text-white font-bold"
                    placeholder="Deck Name"
                />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
                <button onClick={onSave} className={buttonClass}>Save Deck</button>
                <button onClick={onLoad} className={buttonClass}>Load Deck</button>
                <button onClick={onClear} className={buttonClass}>Clear Deck</button>
                <button onClick={onSort} className={buttonClass}>Sort</button>
                <button onClick={onImport} className={buttonClass}>Import</button>
                <button onClick={onExport} className={buttonClass}>Export</button>
            </div>
        </div>
    );
}
