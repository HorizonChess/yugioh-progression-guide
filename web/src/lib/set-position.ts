import { isTimelineSet, resolveSetIndex, timelineSets, type CardSet } from "@ygo/shared";
import type { SaveSlot } from "@/lib/storage";

/*
 * Keeps every guest save on the set it was really at.
 *
 * A save's position used to be only an index into the timeline. Indexes can
 * drift: the timeline sort now breaks same-day ties by name (two pairs of
 * sets share a release date), and a future card-data update could add a set.
 * So saves also remember the set's NAME, and the name wins.
 *
 * Saves written before names existed are translated once, using the timeline
 * order they were written under: sorted by date only, ties left in the order
 * YGOPRODeck returned them. That's exactly what the old code computed from the
 * same raw response, so the set it meant is recovered, not guessed.
 */

/** The timeline as the app ordered it before the name tiebreak (date only, stable). */
export function legacyTimelineSets(rawSets: readonly CardSet[]): CardSet[] {
    return rawSets
        .filter(isTimelineSet)
        .sort((a, b) => new Date(a.tcg_date).getTime() - new Date(b.tcg_date).getTime());
}

/**
 * Returns `save` pointed at the right set and remembering its name, or the very
 * same object if nothing needed fixing (so React state only changes when it must).
 */
export function reconcileSave(save: SaveSlot, timeline: readonly CardSet[], legacy: readonly CardSet[]): SaveSlot {
    const order = save.currentSetName !== undefined || save.setOrder === 2 ? timeline : legacy;
    const name = save.currentSetName ?? order[save.currentSetIndex]?.set_name;
    const index = resolveSetIndex(timeline, name, save.currentSetIndex);

    // Rewards remember their pack by name already; repair their index from it.
    let rewardsChanged = false;
    const rewards = save.rewards.map((reward) => {
        const fixed = resolveSetIndex(timeline, reward.wonFromPackName, reward.wonFromSetIndex);
        if (fixed === reward.wonFromSetIndex) return reward;
        rewardsChanged = true;
        return { ...reward, wonFromSetIndex: fixed };
    });

    const unchanged = index === save.currentSetIndex && name === save.currentSetName && save.setOrder === 2 && !rewardsChanged;
    if (unchanged) return save;
    return {
        ...save,
        currentSetIndex: index,
        ...(name !== undefined ? { currentSetName: name } : {}),
        setOrder: 2,
        rewards: rewardsChanged ? rewards : save.rewards,
    };
}

/** `reconcileSave` over every save; the same array back if none changed. */
export function reconcileSaves(saves: SaveSlot[], rawSets: readonly CardSet[]): SaveSlot[] {
    if (rawSets.length === 0) return saves;
    const timeline = timelineSets(rawSets);
    const legacy = legacyTimelineSets(rawSets);
    let changed = false;
    const next = saves.map((save) => {
        const fixed = reconcileSave(save, timeline, legacy);
        if (fixed !== save) changed = true;
        return fixed;
    });
    return changed ? next : saves;
}
