import React from 'react';
import FrameButton from '@/components/ui/FrameButton';

interface RecordMatchProps {
    onRecord: (winner: 'player' | 'opponent') => void;
    onCancel: () => void;
    opponentName?: string;
    winRate?: string;
    streak?: string;
}

/**
 * RecordMatch — "you just finished a duel, log the result."
 *
 * The BOARD CONTENT of the win moment: opponent heading → stone scoreboard
 * (Win Rate / Streak) → VICTORY/DEFEAT → back link. It is rendered INSIDE the
 * shared, always-mounted `.win-panel` (see app/record-match/page.tsx): after a
 * win this content vortexes out and the Winner's Wheel curtains in WITHOUT the
 * panel box moving. So this component is now just the inner stack — the panel,
 * centering, and glass surface live in the page.
 *
 * Built from design-system primitives + tokens (NOT the old full-screen PNG or
 * its percentage map). A vertical stack of content-sized rows, one relative gap,
 * reflows at any width with no fixed-canvas scaling (avoid-magic-numbers-layout).
 */
export default function RecordMatch({
    onRecord,
    onCancel,
    opponentName = '',
    winRate = '--',
    streak = '--'
}: RecordMatchProps) {
    return (
        <div className="record-board">

            {/* Heading — "Record Match" + the opponent name (gold accent) */}
            <div className="text-center">
                <span className="record-eyebrow">Record Match</span>
                <h1 className="text-3xl md:text-4xl font-black text-white leading-tight mt-1">
                    vs <span className="text-primary">{opponentName || 'Unknown Duelist'}</span>
                </h1>
            </div>

            {/* Stone scoreboard — Win Rate + Streak (both passed in by the page) */}
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
                    textClassName="text-[clamp(1rem,2.4vh,1.5rem)] tracking-[0.2em]"
                    aria-label="Record a victory"
                >
                    Victory
                </FrameButton>
                <FrameButton
                    onClick={() => onRecord('opponent')}
                    className="record-action-btn record-action-btn--defeat"
                    textClassName="text-[clamp(1rem,2.4vh,1.5rem)] tracking-[0.2em]"
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
    );
}
