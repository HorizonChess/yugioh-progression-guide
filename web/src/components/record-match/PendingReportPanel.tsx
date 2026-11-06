import CartoucheButton from "@/components/ui/CartoucheButton";
import { Tablet } from "@/components/record-match/RecordMatch";
import type { PendingReport } from "@/lib/repo/types";

interface PendingReportPanelProps {
    report: PendingReport;
    rival: string;
    /** This player sent the report, so it's the rival's turn to answer. */
    mine: boolean;
    onAnswer: (confirm: boolean) => void;
}

/** A duo result waiting for confirmation: the reported tablet lit; the reporter waits, the rival confirms or rejects. */
export default function PendingReportPanel({ report, rival, mine, onAnswer }: PendingReportPanelProps) {
    const reporterWon = report.winnerId === report.reporterId;
    const youWon = mine === reporterWon;
    return (
        <>
            <b className="rm-ask rm-carved">{mine ? `Waiting for ${rival}` : `${rival} reports a result`}</b>
            <div className="rm-tabs rm-tabs--one"><Tablet side={youWon ? "win" : "lose"} chosen /></div>
            <p className="rm-note">
                {mine ? (
                    <><span className="rm-hourglass" aria-hidden="true">⌛</span> You reported a <b>{youWon ? "victory" : "defeat"}</b>. {rival} has to confirm it.</>
                ) : (
                    <>{rival} says <b>{youWon ? "you won" : "they won"}</b>. Confirm it, or reject it.</>
                )}
            </p>
            {!mine && (
                <div className="rm-btns">
                    <CartoucheButton onClick={() => onAnswer(true)}>Confirm</CartoucheButton>
                    <CartoucheButton onClick={() => onAnswer(false)} className="rm-cartouche--silver">Reject</CartoucheButton>
                </div>
            )}
        </>
    );
}
