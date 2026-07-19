// Allow importing .mjs test helpers without explicit declarations
declare module '*.mjs' {
    // biome-ignore lint/suspicious/noExplicitAny: module shape is unknown
    const content: Record<string, any>;
    export default content;
}
