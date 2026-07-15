import React, { useState } from 'react';

interface RecordMatchProps {
    onRecord: (winner: 'player' | 'opponent') => void;
    onCancel: () => void;
    mode?: 'modal' | 'fullPage';
    opponentName?: string;
    winRate?: string;
    streak?: string;
}

// Layout Config - static positioning
const LAYOUT = {
    opponentName: { top: 12.61, left: 15.84, width: 20.07, height: 11.76 },
    cardSlot: { top: 36.07, left: 20.84, width: 10.83, height: 33.96 },
    statsBox: { top: 76.49, left: 10.66, width: 31.59, height: 10.9 },
    victoryTablet: { top: 34.15, left: 45.32, width: 18.92, height: 30.37 },
    defeatTablet: { top: 33.29, left: 65.63, width: 19.47, height: 30.97 },
    victoryButton: { top: 71.66, left: 45.21, width: 19.19, height: 14.07 },
    defeatButton: { top: 72.26, left: 65.85, width: 18.92, height: 13.1 },
    backButton: { top: 92.63, left: 11.48, width: 20, height: 5 }
};

// Helper to get style from layout config
function getStyle(key: keyof typeof LAYOUT) {
    const item = LAYOUT[key];
    return {
        position: 'absolute' as const,
        top: `${item.top}%`,
        left: `${item.left}%`,
        width: `${item.width}%`,
        height: `${item.height}%`,
        zIndex: 10,
    };
}

export default function RecordMatch({
    onRecord,
    onCancel,
    mode = 'fullPage',
    opponentName = '',
    winRate = '--',
    streak = '--'
}: RecordMatchProps) {
    const [hoveredSection, setHoveredSection] = useState<'victory' | 'defeat' | null>(null);

    // Harpie Lady
    const cardId = "76812113";
    const cardImageUrl = `${process.env.NEXT_PUBLIC_IMAGE_HOST}/cards/${cardId}.jpg`;

    // Container classes based on mode
    const containerClasses = mode === 'modal'
        ? "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 pt-10"
        : "flex-1 flex items-center justify-center bg-transparent p-4";

    return (
        <div className={containerClasses}>
            {/*
                Main Container
                Aspect Ratio: 1376/768 ≈ 1.79
            */}
            <div className="relative w-full max-w-[95vw] max-h-[90vh] aspect-[1376/768] select-none shadow-2xl">

                {/* Main Background */}
                <img
                    src="/assets/record match/record_match_ui.png"
                    alt="Record Match Interface"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none z-0"
                />

                {/* --- ELEMENTS --- */}

                {/* Opponent Label & Name */}
                <div style={getStyle('opponentName')} className="flex flex-col justify-center px-4">
                    <div className="flex flex-col">
                        <span className="text-wood-border font-bold uppercase tracking-wider text-sm mb-1 opacity-90">
                            Opponent:
                        </span>
                        <span className="text-primary text-3xl font-black uppercase tracking-tighter drop-shadow-md truncate">
                            {opponentName}
                        </span>
                    </div>
                </div>

                {/* Center Card Slot */}
                <div style={getStyle('cardSlot')} className="flex items-center justify-center">
                    <img
                        src={cardImageUrl}
                        alt="Opponent Card"
                        className="w-[92%] h-[92%] object-cover rounded shadow-lg opacity-90 transition-opacity hover:opacity-100"
                    />
                </div>

                {/* Stats Footer - Win Rate & Streak */}
                <div style={getStyle('statsBox')} className="flex items-center justify-around">
                    <div className="text-center w-1/3 pt-1">
                        <div className="text-xs text-wood-border font-bold uppercase tracking-wider mb-0.5 opacity-80">Win Rate</div>
                        <div className="text-parchment text-3xl font-bold tracking-widest drop-shadow-md leading-none">{winRate}</div>
                    </div>
                    <div className="text-center w-1/3 pt-1">
                        <div className="text-xs text-wood-border font-bold uppercase tracking-wider mb-0.5 opacity-80">Streak</div>
                        <div className="text-parchment text-3xl font-bold tracking-widest drop-shadow-md leading-none">{streak}</div>
                    </div>
                </div>

                {/* Victory Tablet (Hover Glow) */}
                <div style={{ ...getStyle('victoryTablet'), pointerEvents: 'none' }}>
                    <div
                        className={`w-full h-full rounded-xl transition-all duration-300 ease-in-out
                            ${hoveredSection === 'victory'
                                ? 'bg-yellow-400/10 opacity-100 shadow-[0_0_40px_rgba(234,179,8,0.4)_inset]'
                                : 'opacity-0'}`}
                    />
                </div>

                {/* Defeat Tablet (Hover Glow) */}
                <div style={{ ...getStyle('defeatTablet'), pointerEvents: 'none' }}>
                    <div
                        className={`w-full h-full rounded-xl transition-all duration-300 ease-in-out
                            ${hoveredSection === 'defeat'
                                ? 'bg-red-500/10 opacity-100 shadow-[0_0_40px_rgba(220,38,38,0.4)_inset]'
                                : 'opacity-0'}`}
                    />
                </div>

                {/* Victory Button */}
                <div
                    style={{ ...getStyle('victoryButton'), zIndex: 20 }}
                    className="flex items-center justify-center group cursor-pointer"
                    onMouseEnter={() => setHoveredSection('victory')}
                    onMouseLeave={() => setHoveredSection(null)}
                    onClick={() => onRecord('player')}
                >
                    <div className={`text-parchment font-black text-2xl tracking-[0.2em] uppercase transition-all duration-300 transform group-hover:scale-105 drop-shadow-lg ${hoveredSection === 'victory' ? 'text-yellow-200' : ''}`}>
                        VICTORY
                    </div>
                </div>

                {/* Defeat Button */}
                <div
                    style={{ ...getStyle('defeatButton'), zIndex: 20 }}
                    className="flex items-center justify-center group cursor-pointer"
                    onMouseEnter={() => setHoveredSection('defeat')}
                    onMouseLeave={() => setHoveredSection(null)}
                    onClick={() => onRecord('opponent')}
                >
                    <div className={`text-parchment font-black text-2xl tracking-[0.2em] uppercase transition-all duration-300 transform group-hover:scale-105 drop-shadow-lg ${hoveredSection === 'defeat' ? 'text-red-200' : ''}`}>
                        DEFEAT
                    </div>
                </div>

                {/* Back to Dashboard / Cancel Button */}
                <div
                    style={{ ...getStyle('backButton'), zIndex: 30 }}
                    className="flex items-center px-4 cursor-pointer"
                    onClick={() => onCancel()}
                >
                    <div className="text-wood-border hover:text-primary font-bold text-sm uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-2">
                        <span>←</span> Back to Dashboard
                    </div>
                </div>

            </div>
        </div>
    );
}
