// Ambient module declarations for non-code imports.
//
// Next.js normally provides these via `.next/types` (regenerated on dev/build),
// but the editor's TS server can lag behind that generation — surfacing a red
// "Cannot find module './globals.css'" on the side-effect CSS import in
// app/layout.tsx even though lint and build are clean. Declaring them here makes
// the types stable and editor-independent.

declare module "*.css";

// CSS Modules (e.g. `import styles from "./x.module.css"`) — typed as a class map.
declare module "*.module.css" {
    const classes: { readonly [key: string]: string };
    export default classes;
}
