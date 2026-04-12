import { createSplash, TILE_PRESETS } from 'even-toolkit/splash'

function drawPixelSpinner(ctx: CanvasRenderingContext2D, cx: number, cy: number, cellSize: number, gap: number) {
  const colors = [
    '#97D077', '#B9E0A5',
    '#D5E8D4', '#000000',
  ]
  const totalSize = cellSize * 2 + gap
  const startX = cx - totalSize / 2
  const startY = cy - totalSize / 2

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const x = startX + col * (cellSize + gap)
      const y = startY + row * (cellSize + gap)
      ctx.fillStyle = colors[row * 2 + col]
      ctx.fillRect(x, y, cellSize, cellSize)
    }
  }
}

export function renderSplash(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const fg = '#97D077'
  const cx = w / 2
  const s = Math.min(w / 200, h / 200)

  ctx.fillStyle = fg
  ctx.font = `bold ${18 * s}px "Courier New", monospace`
  ctx.textAlign = 'center'
  ctx.fillText('CADUCEUS', cx, 40 * s)

  drawPixelSpinner(ctx, cx, 90 * s, 18 * s, 3 * s)

  ctx.fillStyle = fg
  ctx.font = `bold ${11 * s}px "Courier New", monospace`
  ctx.fillText('loading ...', cx, 140 * s)
  ctx.textAlign = 'left'
}

export const appSplash = createSplash({
  tiles: 2,
  tileLayout: 'vertical',
  tilePositions: TILE_PRESETS.topCenterVertical2,
  canvasSize: { w: 200, h: 200 },
  minTimeMs: 2000,
  maxTimeMs: 10000,
  menuText: '',
  render: renderSplash,
})
