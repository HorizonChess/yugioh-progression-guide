"use client";

import React from 'react';
import { RewardEntry, getPrize } from '@/lib/rewards';
import FrameButton from '@/components/ui/FrameButton.view';

interface RewardCardProps {
    entry: RewardEntry;
    /** Label for the primary action button (e.g. "Claim", "Open", "Choose Card"). */
    actionLabel?: string;
    /** Fires the primary action. Omit + set `locked` for not-yet-claimable prizes. */
    onAction?: () => void;
    /** Available-but-not-claimable (e.g. Snatch Steal — needs multiplayer). */
    locked?: boolean;
    /** Short note shown when locked (e.g. "Requires multiplayer — coming soon"). */
    lockedNote?: string;
    /** Busy state while a claim flow runs (disables the button). */
    busy?: boolean;
}

/**
 * RewardCard — one row in the Rewards ledger.
 *
 * Presentational: shows the prize label, the pack it was won from, and the date.
 * The claim affordance is driven entirely by props (the controller decides what
 * each prize kind does), so this view stays dumb. Claimed entries render without
 * an action (read-only) — the controller passes no `onAction`/`actionLabel`.
 */
export default function RewardCard({ entry, actionLabel, onAction, locked, lockedNote, busy }: RewardCardProps) {
    const prize = getPrize(entry.prizeId);
    const label = prize?.label ?? entry.prizeId;
    const isClaimed = entry.status === 'claimed';
    const date = new Date(isClaimed && entry.claimedDate ? entry.claimedDate : entry.wonDate);

    return (
        <div className="reward-card">
            <div className="min-w-0 flex-1">
                <div className="reward-card__title">{label}</div>
                <div className="reward-card__meta">
                    <span className="truncate">from {entry.wonFromPackName}</span>
                    <span aria-hidden className="opacity-50">·</span>
                    <span className="whitespace-nowrap">
                        {isClaimed ? 'Claimed' : 'Won'} {date.toLocaleDateString()}
                    </span>
                </div>
                {locked && lockedNote && (
                    <div className="reward-card__note">{lockedNote}</div>
                )}
            </div>

            <div className="shrink-0 flex items-center">
                {isClaimed ? (
                    <span className="reward-card__claimed-badge">Claimed</span>
                ) : locked ? (
                    <span className="reward-card__locked-badge">Locked</span>
                ) : onAction && actionLabel ? (
                    <FrameButton
                        onClick={busy ? undefined : onAction}
                        className={`h-11 px-5 ${busy ? 'opacity-60 pointer-events-none' : ''}`}
                        textClassName="tracking-[0.1em] text-[0.72rem]"
                        aria-label={actionLabel}
                    >
                        {busy ? 'Working…' : actionLabel}
                    </FrameButton>
                ) : null}
            </div>
        </div>
    );
}
