"use client";

/** Prev / page-indicator / Next controls for the collection grid. */
export default function CollectionPagination({
    currentPage,
    totalPages,
    onPrev,
    onNext,
}: {
    currentPage: number;
    totalPages: number;
    onPrev: () => void;
    onNext: () => void;
}) {
    return (
        <div className="flex justify-center mt-12 gap-2">
            <button onClick={onPrev} disabled={currentPage === 1} className="pager-btn">
                Prev
            </button>
            <span className="px-4 py-2 text-primary font-bold">
                Page {currentPage} of {totalPages}
            </span>
            <button onClick={onNext} disabled={currentPage === totalPages} className="pager-btn">
                Next
            </button>
        </div>
    );
}
