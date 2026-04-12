import { createSplash, TILE_PRESETS } from 'even-toolkit/splash'

export function renderSplash(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const fg = '#e0e0e0'
  const cx = w / 2
  const s = Math.min(w / 200, h / 200)

  ctx.fillStyle = fg
  ctx.font = `bold ${16 * s}px "Courier New", monospace`
  ctx.textAlign = 'center'
  ctx.fillText('G2', cx, 40 * s)
  ctx.font = `bold ${11 * s}px "Courier New", monospace`
  ctx.fillText('CADUCEUS', cx, 60 * s)

  // Draw a simple caduceus-like symbol
  ctx.strokeStyle = fg
  ctx.lineWidth = 2 * s
  ctx.beginPath()
  // Vertical line
  ctx.moveTo(cx, 75 * s)
  ctx.lineTo(cx, 130 * s)
  // Wings
  ctx.moveTo(cx - 25 * s, 85 * s)
  ctx.quadraticCurveTo(cx - 10 * s, 78 * s, cx, 85 * s)
  ctx.quadraticCurveTo(cx + 10 * s, 78 * s, cx + 25 * s, 85 * s)
  ctx.moveTo(cx - 20 * s, 95 * s)
  ctx.quadraticCurveTo(cx - 8 * s, 89 * s, cx, 95 * s)
  ctx.quadraticCurveTo(cx + 8 * s, 89 * s, cx + 20 * s, 95 * s)
  // Snakes
  ctx.lineWidth = 1.5 * s
  ctx.beginPath()
  ctx.moveTo(cx - 8 * s, 130 * s)
  ctx.bezierCurveTo(cx - 15 * s, 120 * s, cx + 5 * s, 110 * s, cx - 5 * s, 100 * s)
  ctx.moveTo(cx + 8 * s, 130 * s)
  ctx.bezierCurveTo(cx + 15 * s, 120 * s, cx - 5 * s, 110 * s, cx + 5 * s, 100 * s)
  ctx.stroke()

  ctx.textAlign = 'left'
}

export const appSplash = createSplash({
  tiles: 1,
  tileLayout: 'vertical',
  tilePositions: TILE_PRESETS.topCenter1,
  canvasSize: { w: 200, h: 200 },
  minTimeMs: 0,
  maxTimeMs: 0,
  menuText: '',
  render: renderSplash,
})
