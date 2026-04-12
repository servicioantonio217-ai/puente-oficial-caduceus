/**
 * UI helpers for G2 Caduceus glasses display.
 *
 * Design follows even-toolkit per-screen architecture:
 * - All screens use text mode with scrollable lists
 * - Uses toolkit's buildScrollableList, glassHeader, drillLabel, backLabel
 * - No split layout
 *
 * NOTE: G2 font is NOT monospace — Unicode box-drawing chars
 * (╭╮╰╯│─) do NOT align properly and must never be used.
 * Only geometric shapes (▶ ◀ ▲ ▼ ■ ◆ ● ○) are confirmed supported.
 */

/** Max sessions shown on glasses (most recently active) */
export const MAX_GLASS_SESSIONS = 10
