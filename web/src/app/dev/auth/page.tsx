import { Suspense } from "react";
import type { Metadata } from "next";
import AuthPlayground from "@/components/dev/AuthPlayground";

export const metadata: Metadata = {
    title: "Account test page",
    robots: { index: false },
};

export default function AuthTestPage() {
    // useSearchParams needs a Suspense boundary in a statically exported page.
    return (
        <Suspense fallback={null}>
            <AuthPlayground />
        </Suspense>
    );
}
