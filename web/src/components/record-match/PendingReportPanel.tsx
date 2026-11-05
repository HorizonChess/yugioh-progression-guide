import FrameButton from "@/components/ui/FrameButton";
import type { PendingReport } from "@/lib/repo/types";

interface PendingReportPanelProps {
    report: PendingReport;
    rival: string;
    /** This player sent the report, so it's the rival's turn to answer. */
    mine: boolean;
    onAnswer: (confirm: boolean) => void;
    onBack: () => void;
}

/** A duo result waiting for confirmation: the reporter waits, the rival confirms or rejects. */
export default function PendingReportPanel({ report, rival, mine, onAnswer, onBack }: PendingReportPanelProps) {
    const reporterWon = report.winnerId === report.reporterId;
    const youWon = mine === reporterWon;
    return (
        <div className="record-board">
            <div className="text-center">
                <span className="record-eyebrow">{report.setName}</span>
                <h1 className="text-2xl md:text-3xl font-black text-white leading-tight mt-1">
                    {mine ? `Waiting for ${rival} to confirm` : `${rival} reports a result`}
                </h1>
                <p className="mt-3 text-gray-300">
                    {mine ? `You reported a ${youWon ? "victory" : "defeat"}.` : `${rival} says ${youWon ? "you won" : "they won"}.`}
                </p>
            </div>
            {!mine && (
                <div className="record-board__actions">
                    <FrameButton onClick={() => onAnswer(true)} className="record-action-btn" textClassName="text-[clamp(1rem,2.4vh,1.5rem)] tracking-[0.2em]">
                        Confirm
                    </FrameButton>
                    <FrameButton
                        onClick={() => onAnswer(false)}
                        className="record-action-btn record-action-btn--defeat"
                        textClassName="text-[clamp(1rem,2.4vh,1.5rem)] tracking-[0.2em]"
                    >
                        Reject
                    </FrameButton>
                </div>
            )}
            <button onClick={onBack} className="record-board__back">
                <span aria-hidden>←</span> Back to Campaign
            </button>
        </div>
    );
}
