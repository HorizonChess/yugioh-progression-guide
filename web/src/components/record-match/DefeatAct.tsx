"use client";

import CartoucheButton from "@/components/ui/CartoucheButton";
import { Tablet } from "@/components/record-match/RecordMatch";

/**
 * The loss: the bowed tablet stays lit, the 3 Pity Packs of the set are dealt below it,
 * and Claim takes them to the Rewards altar. The way back to the campaign is the board's foot.
 */
export default function DefeatAct({ onClaimPity, packImage }: { onClaimPity: () => void; packImage?: string }) {
    return (
        <>
            <b className="rm-ask rm-carved rm-carved--red">The shadows win this round</b>
            <div className="rm-tabs rm-tabs--one"><Tablet side="lose" chosen /></div>
            {packImage && (
                <div className="rm-packs" aria-hidden="true">
                    {[-10, 0, 10].map((r, i) => (
                        <img key={i} src={packImage} alt="" style={{ "--r": `${r}deg`, "--y": r ? "5%" : "0", "--d": `${0.05 + i * 0.13}s` } as React.CSSProperties} />
                    ))}
                </div>
            )}
            <p className="rm-note"><b>3 Pity Packs</b> to rebuild your deck</p>
            <CartoucheButton onClick={onClaimPity} aria-label="Claim pity packs">Claim pity packs</CartoucheButton>
        </>
    );
}
