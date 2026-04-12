/**
 * UI helpers for Caduceus glasses display.
 *
 * Visual language ("Signal" design):
 *   ● filled  = live, active, happening now
 *   ○ hollow  = waiting, processing, passive
 *   > arrow   = outgoing message (user)
 *     indent  = incoming message (assistant, 2-space prefix)
 *   ! alert   = error, needs attention
 *   · dot     = meta / field separator
 *   — dash    = inactive, blocked, unavailable
 *   ■ square  = stop action (recording)
 *
 * Rules:
 * - Filled shapes = energy/action. Hollow = pause/waiting.
 * - Absence of indicator = idle (never write "idle" explicitly).
 * - Header is the status center — never put status in chat content.
 * - Chat content is pure messages only (user + assistant).
 *
 * NOTE: G2 font is NOT monospace — Unicode box-drawing chars
 * (╭╮╰╯│─) do NOT align properly and must never be used.
 * Only geometric shapes (▶ ◀ ▲ ▼ ■ ◆ ● ○) are confirmed supported.
 */

/** Max sessions shown on glasses (most recently active) */
export const MAX_GLASS_SESSIONS = 10
