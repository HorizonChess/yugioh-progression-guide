/*
 * What a player is told about: the bell's list, and the same words as a push notification on their
 * phone or computer. Things that need them: a rival's move, invite, challenge, report, ban. Not the
 * result of a duel they just played to its end (they saw it).
 */

export type NotificationType =
    | 'invite'
    | 'invite-accepted'
    | 'invite-declined'
    | 'report'
    | 'report-confirmed'
    | 'report-rejected'
    | 'snatched'
    | 'banlist'
    | 'rival-left'
    | 'duel-challenge'
    | 'duel-accepted'
    | 'duel-declined'
    | 'duel-call-off'
    | 'duel-turn'
    | 'duel-result';

/** Display-ready details: who did it, in which series, to which card. */
export type NotificationPayload = Record<string, string | number | boolean>;

export interface AppNotification {
    id: string;
    type: NotificationType;
    seriesId: string;
    payload: NotificationPayload;
    read: boolean;
    createdAt: string;
}

/** The notification in a sentence, as the bell lists it and the push says it. */
export function describeNotification({ type, payload: p }: Pick<AppNotification, 'type' | 'payload'>): string {
    const series = `“${p.seriesName}”`;
    switch (type) {
        case 'invite':
            return `${p.from} invites you to the duo series ${series}.`;
        case 'invite-accepted':
            return `${p.from} joined ${series}. Let the duels begin!`;
        case 'invite-declined':
            return `${p.from} declined your invite to ${series}.`;
        case 'report':
            return `${p.from} reports that ${p.youWon ? 'you' : 'they'} won on ${p.setName}. Confirm it?`;
        case 'report-confirmed':
            return `${p.from} confirmed your ${p.youWon ? 'win' : 'loss'} on ${p.setName}.`;
        case 'report-rejected':
            return `${p.from} rejected your result on ${p.setName}. Report it again.`;
        case 'snatched':
            return `${p.from} used Snatch Steal to copy one of your cards in ${series}.`;
        case 'banlist':
            return `${p.from} ${p.banned ? 'banned' : 'unbanned'} a card in ${series}.`;
        case 'rival-left':
            return `${p.from} left ${series}. The series is paused.`;
        case 'duel-challenge':
            return `${p.from} challenges you to a duel on ${p.setName}!`;
        case 'duel-accepted':
            return `${p.from} accepted your challenge on ${p.setName}. Your duel is on!`;
        case 'duel-declined':
            return `Your challenge on ${p.setName} was declined.`;
        case 'duel-call-off':
            return p.done ? `Your duel with ${p.from} on ${p.setName} was called off. Nothing was recorded.` : `${p.from} asks to call off your duel on ${p.setName}. Open it to answer.`;
        case 'duel-turn':
            return `${p.from} made a move in your duel on ${p.setName}. It's your move.`;
        case 'duel-result':
            return `You ${p.youWon ? 'beat' : 'lost to'} ${p.from} on ${p.setName}. It's on the series.`;
    }
}

/** A push notification's title: what kind of thing happened. */
export function notificationTitle(type: NotificationType): string {
    switch (type) {
        case 'invite': case 'invite-accepted': case 'invite-declined': case 'rival-left':
            return 'Your duo series';
        case 'report': case 'report-confirmed': case 'report-rejected':
            return 'Match result';
        case 'snatched':
            return 'Snatch Steal';
        case 'banlist':
            return 'Banlist';
        case 'duel-challenge':
            return 'Duel challenge';
        case 'duel-turn':
            return 'Your move';
        default:
            return 'Your duel';
    }
}
