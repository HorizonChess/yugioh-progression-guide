"use client";

import { usePathname } from "next/navigation";
import TopBar from "@/components/shell/TopBar.view";

/* The persistent nav is hoisted into the root layout, but shown only on the
   "app main zone" pages that opted into it. Everything else (Packs, Menu, and
   Record Match still render their OWN TopBar for now; onboarding/start/root have
   no nav) is left untouched — so an explicit allow-list, not an opt-out list. */
const NAV_ROUTES = new Set(["/map", "/collection", "/deck-builder"]);

/**
 * AppNav — renders the single, persistent nav bar in the root layout, above the
 * routed content and outside the page-transition template, so it never unmounts
 * or animates on navigation and sits pixel-identically across these pages.
 */
export default function AppNav() {
    const pathname = usePathname();
    if (!NAV_ROUTES.has(pathname)) return null;
    return <TopBar />;
}
