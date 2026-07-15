import React from 'react';
import FrameButton from '@/components/ui/FrameButton.view';

interface RecordMatchProps {
    onRecord: (winner: 'player' | 'opponent') => void;
    onCancel: () => void;
    mode?: 'modal' | 'fullPage';
    opponentName?: string;
    winRate?: string;
    streak?: string;
}

/**
 * RecordMatch — "you just finished a duel, log the result."
 *
 * A centered game-loop module on the dark stone background, matching the /packs
 * StoreView look (white heading + gold accents + stone scoreboard + FrameButtons).
 * Rebuilt from design-system primitives + tokens — NOT the old full-screen PNG
 * asset or its hand-measured percentage-position map (both gone). A vertical stack of
 * named rows sized by content, one relative gap, everything reflows at any width
 * with no fixed-canvas scaling (see avoid-magic-numbers-layout).
 */
export default function RecordMatch({
    onRecord,
    onCancel,
    mode = 'fullPage',
    opponentName = '',
    winRate = '--',
    streak = '--'
}: RecordMatchProps) {
    const containerClasses = mode === 'modal'
        ? "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        : "flex-1 flex items-center justify-center p-4 md:p-8";

    return (
        <div className={containerClasses}>
            {/* Centered record-match module — stacked rows, one relative gap */}
            <div className="record-board">

                {/* Heading — "Record Match" + the opponent name (gold accent) */}
                <div className="text-center">
                    <span className="record-eyebrow">Record Match</span>
                    <h1 className="text-4xl md:text-5xl font-black text-white leading-tight mt-1">
                        vs <span className="text-primary">{opponentName || 'Unknown Duelist'}</span>
                    </h1>
                </div>

                {/* Stone scoreboard — Win Rate + Streak (both passed in by the controller) */}
                <div className="stone-panel record-board__scoreboard">
                    <div className="record-stat">
                        <span className="record-stat__label">Win Rate</span>
                        <span className="record-stat__value">{winRate}</span>
                    </div>
                    <div className="record-board__divider" aria-hidden />
                    <div className="record-stat">
                        <span className="record-stat__label">Streak</span>
                        <span className="record-stat__value">{streak}</span>
                    </div>
                </div>

                {/* VICTORY / DEFEAT — real FrameButtons; DEFEAT is red-tinted via a modifier */}
                <div className="record-board__actions">
                    <FrameButton
                        onClick={() => onRecord('player')}
                        className="record-action-btn"
                        textClassName="text-[clamp(1.1rem,2.6vh,1.6rem)] tracking-[0.2em]"
                        aria-label="Record a victory"
                    >
                        Victory
                    </FrameButton>
                    <FrameButton
                        onClick={() => onRecord('opponent')}
                        className="record-action-btn record-action-btn--defeat"
                        textClassName="text-[clamp(1.1rem,2.6vh,1.6rem)] tracking-[0.2em]"
                        aria-label="Record a defeat"
                    >
                        Defeat
                    </FrameButton>
                </div>

                {/* Back to Dashboard — subtle gray→white, matching StoreView/Menu */}
                <button onClick={onCancel} className="record-board__back">
                    <span aria-hidden>←</span> Back to Dashboard
                </button>

            </div>
        </div>
    );
}
