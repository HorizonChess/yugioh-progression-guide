"use client";

import React from 'react';
import FrameButton from '@/components/ui/FrameButton.view';

interface DefeatActProps {
    /** Claim the 3 pity packs — routes on to the Rewards tab. */
    onClaimPity: () => void;
    /** Skip the reward for now and head back to the campaign map. */
    onBackToCampaign: () => void;
}

/**
 * DefeatAct — the "you lost" CONTENT (loss path only).
 *
 * The DEFEAT act of the record moment: eyebrow → DEFEAT headline → a line
 * telling the player they get 3 Pity Packs → two exits. It is rendered INSIDE
 * the shared, always-mounted `.win-panel` (see RecordMatchPage.controller) — it
 * curtains IN where the record board vortexed OUT, without the panel box moving,
 * exactly like WinnersWheel does on the win path (so win and loss feel the same).
 *
 * Presentational only: the panel, centering, and glass surface live in the
 * controller; this is just the inner stack. Built from tokens + FrameButton so
 * it matches the app and re-themes with --primary.
 */
export default function DefeatAct({ onClaimPity, onBackToCampaign }: DefeatActProps) {
    return (
        <div className="defeat-content">
            <div className="text-center">
                <span className="record-eyebrow">Match Result</span>
                <h2 className="record-outcome record-outcome--defeat mt-1">Defeat</h2>
            </div>

            <p className="text-center text-white/90 text-lg md:text-xl font-bold leading-snug px-2">
                You get <span className="text-primary">3 Pity Packs</span> to rebuild your deck.
            </p>

            {/* Buttons fill the column up to a cap, so they shrink on a narrow
                panel (no overflow) and never stretch too wide on a large one —
                correct-by-construction rather than a fixed pixel width. */}
            <div className="w-full max-w-[16rem] flex flex-col items-stretch gap-3">
                <FrameButton
                    onClick={onClaimPity}
                    className="w-full h-12"
                    textClassName="tracking-[0.12em]"
                    aria-label="Claim pity packs"
                >
                    Claim Pity Packs
                </FrameButton>
                <FrameButton
                    onClick={onBackToCampaign}
                    className="w-full h-11"
                    textClassName="tracking-[0.12em]"
                    aria-label="Back to campaign"
                >
                    Back to Campaign
                </FrameButton>
            </div>
        </div>
    );
}
