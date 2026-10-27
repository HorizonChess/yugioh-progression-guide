// Moved to @ygo/shared so the API resolves prizes with the same rules.
export {
    WHEEL_PRIZES,
    PITY_PRIZE,
    isPrizeId,
    getPrize,
    resolvePrizeKind,
    claimedCardId,
    claimedCardCaption,
    wildcardRarityFloor,
    isRarityAtOrBelow,
} from '@ygo/shared';
export type { PrizeId, WheelPrize, RewardStatus, RewardEntry, PrizeKind } from '@ygo/shared';
