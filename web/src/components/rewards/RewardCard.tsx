"use client";

import React from 'react';
import { Card } from '@/lib/api';
import { RewardEntry, getPrize, claimedCardCaption, resolvePrizeKind } from '@/lib/rewards';
import FrameButton from '@/components/ui/FrameButton';

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
    /** The single card a CLAIMED reward resolved to (wildcard/ban/etc.) — shown as
     *  a thumbnail. Pack rewards pass none (shown as a count via `packCount`). */
    pickedCard?: Card | null;
    /** For claimed pack rewards (pity/tournament): how many cards were opened. */
    packCount?: number;
    /** Open the picked card's detail modal (claimed thumbnail click). */
    onPickedCardClick?: (card: Card) => void;
}

/**
 * RewardCard — one row in the Rewards ledger.
 *
 * Presentational: shows the prize label, the pack it was won from, and the date.
 * The claim affordance is driven entirely by props (the page decides what
 * each prize kind does), so this view stays dumb. Claimed entries render without
 * an action (read-only) — the page passes no `onAction`/`actionLabel`.
 */
export default function RewardCard({ entry, actionLabel, onAction, locked, lockedNote, busy, pickedCard, packCount, onPickedCardClick }: RewardCardProps) {
    const prize = getPrize(entry.prizeId);
    const label = prize?.label ?? entry.prizeId;
    const isClaimed = entry.status === 'claimed';
    const date = new Date(isClaimed && entry.claimedDate ? entry.claimedDate : entry.wonDate);
    const isBanKind = resolvePrizeKind(entry.prizeId) === 'ban';

    return (
        <div className="reward-card">
            {/* Claimed single-pick thumbnail (wildcard / ban / snatch / …). */}
            {isClaimed && pickedCard && (
                <button
                    type="button"
                    onClick={() => onPickedCardClick?.(pickedCard)}
                    className={`reward-card__thumb group ${isBanKind ? 'reward-card__thumb--banned' : ''}`}
                    aria-label={`View ${pickedCard.name}`}
                >
                    <img
                        src={pickedCard.card_images?.[0]?.image_url_small}
                        alt={pickedCard.name}
                        className="w-full h-full object-cover"
                    />
                    {isBanKind && (
                        <span className="reward-card__thumb-marker">BANNED</span>
                    )}
                </button>
            )}

            <div className="min-w-0 flex-1">
                <div className="reward-card__title">{label}</div>
                <div className="reward-card__meta">
                    <span className="truncate">from {entry.wonFromPackName}</span>
                    <span aria-hidden className="opacity-50">·</span>
                    <span className="whitespace-nowrap">
                        {isClaimed ? 'Claimed' : 'Won'} {date.toLocaleDateString()}
                    </span>
                </div>
                {/* What the claim resolved to. */}
                {isClaimed && pickedCard && (
                    <div className="reward-card__pick">
                        <span className="reward-card__pick-name truncate">{pickedCard.name}</span>
                        <span aria-hidden className="opacity-40">·</span>
                        <span className="reward-card__pick-caption">{claimedCardCaption(entry)}</span>
                    </div>
                )}
                {isClaimed && !pickedCard && packCount ? (
                    <div className="reward-card__pick">
                        <span className="reward-card__pick-caption">Opened {packCount} cards</span>
                    </div>
                ) : null}
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
