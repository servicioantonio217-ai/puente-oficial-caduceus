/**
 * UI helpers for G2 Caduceus glasses display.
 *
 * Design: green monochrome (#97D077), split-panel layout.
 * Selection indicated with '>' prefix (ASCII arrow) since
 * native SDK borders are disabled by even-toolkit's noBorder().
 *
 * NOTE: G2 font is NOT monospace — Unicode box-drawing chars
 * (╭╮╰╯│─) do NOT align properly and must never be used.
 */

/** Max sessions shown on glasses (most recently active) */
export const MAX_GLASS_SESSIONS = 10
