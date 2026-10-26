// Shared code runs in both the browser and Node, so it compiles without DOM or
// Node typings. Logging is the one runtime global it uses; both hosts provide it.
declare const console: {
    warn(...data: unknown[]): void;
    error(...data: unknown[]): void;
};
