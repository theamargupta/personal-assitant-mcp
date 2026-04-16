import { Resvg, initWasm } from '@resvg/resvg-wasm'
import { readFile } from 'fs/promises'
import { join } from 'path'

let wasmInitialized = false

async function ensureWasm() {
  if (wasmInitialized) return
  try {
    const wasmPath = join(process.cwd(), 'node_modules/@resvg/resvg-wasm/index_bg.wasm')
    const wasmBuffer = await readFile(wasmPath)
    await initWasm(wasmBuffer)
  } catch {
    // Already initialized in this isolate
  }
  wasmInitialized = true
}

async function svgToPng(svg: string, width: number): Promise<string> {
  await ensureWasm()
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width * 2 } })
  const rendered = resvg.render()
  const pngBuffer = rendered.asPng()
  return Buffer.from(pngBuffer).toString('base64')
}

interface HabitHeatmapDay {
  date: string
  completed: boolean
}

interface SpendingBreakdownRow {
  category: string
  icon: string
  amount: number
  count: number
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function createHabitHeatmapImage(data: {
  name: string
  periodDays: number
  completionPercentage: number
  currentStreak: number
  bestStreak: number
  dayByDay: HabitHeatmapDay[]
}) {
  const cell = 18
  const gap = 5
  const left = 26
  const top = 74
  const columns = 7
  const rows = Math.max(Math.ceil(data.dayByDay.length / columns), 1)
  const width = 360
  const height = top + rows * (cell + gap) + 72
  const labelY = top - 12
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  const cells = data.dayByDay.map((day, index) => {
    const x = left + (index % columns) * (cell + gap)
    const y = top + Math.floor(index / columns) * (cell + gap)
    const fill = day.completed ? '#c8ff00' : '#262626'
    const stroke = day.date === data.dayByDay[data.dayByDay.length - 1]?.date ? '#fafafa' : 'none'
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`
  }).join('')

  const dayLabels = labels.map((label, index) =>
    `<text x="${left + index * (cell + gap) + cell / 2}" y="${labelY}" text-anchor="middle" fill="#737373" font-size="10">${label}</text>`,
  ).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" rx="16" fill="#0a0a0a"/>
  <text x="20" y="30" fill="#fafafa" font-family="system-ui, sans-serif" font-size="18" font-weight="700">${escapeXml(data.name)}</text>
  <text x="20" y="51" fill="#737373" font-family="system-ui, sans-serif" font-size="12">${data.periodDays}-day habit heatmap</text>
  ${dayLabels}
  ${cells}
  <text x="20" y="${height - 32}" fill="#c8ff00" font-family="system-ui, sans-serif" font-size="22" font-weight="700">${data.currentStreak}d</text>
  <text x="20" y="${height - 14}" fill="#737373" font-family="system-ui, sans-serif" font-size="10" letter-spacing="1">CURRENT</text>
  <text x="126" y="${height - 32}" fill="#fafafa" font-family="system-ui, sans-serif" font-size="22" font-weight="700">${data.bestStreak}d</text>
  <text x="126" y="${height - 14}" fill="#737373" font-family="system-ui, sans-serif" font-size="10" letter-spacing="1">BEST</text>
  <text x="232" y="${height - 32}" fill="#c8ff00" font-family="system-ui, sans-serif" font-size="22" font-weight="700">${data.completionPercentage}%</text>
  <text x="232" y="${height - 14}" fill="#737373" font-family="system-ui, sans-serif" font-size="10" letter-spacing="1">COMPLETE</text>
</svg>`

  return {
    type: 'image' as const,
    data: await svgToPng(svg, width),
    mimeType: 'image/png',
  }
}

export async function createSpendingChartImage(data: {
  totalSpent: number
  period: { start: string; end: string }
  breakdown: SpendingBreakdownRow[]
}) {
  const width = 520
  const rowHeight = 42
  const chartTop = 86
  const height = Math.max(210, chartTop + data.breakdown.length * rowHeight + 24)
  const maxAmount = Math.max(...data.breakdown.map(row => row.amount), 1)

  const rows = data.breakdown.map((row, index) => {
    const y = chartTop + index * rowHeight
    const barWidth = Math.round((row.amount / maxAmount) * 270)
    const label = `${row.icon} ${row.category}`
    return `<text x="22" y="${y + 14}" fill="#d4d4d4" font-family="system-ui, sans-serif" font-size="13">${escapeXml(label)}</text>
  <text x="474" y="${y + 14}" text-anchor="end" fill="#a3a3a3" font-family="ui-monospace, monospace" font-size="12">Rs ${row.amount.toLocaleString('en-IN')}</text>
  <rect x="22" y="${y + 23}" width="270" height="8" rx="4" fill="#262626"/>
  <rect x="22" y="${y + 23}" width="${barWidth}" height="8" rx="4" fill="${index === 0 ? '#c8ff00' : '#5f6f1c'}"/>`
  }).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" rx="16" fill="#0a0a0a"/>
  <text x="20" y="38" fill="#fafafa" font-family="system-ui, sans-serif" font-size="30" font-weight="700">Rs ${data.totalSpent.toLocaleString('en-IN')}</text>
  <text x="22" y="62" fill="#737373" font-family="system-ui, sans-serif" font-size="12">${escapeXml(data.period.start)} - ${escapeXml(data.period.end)}</text>
  ${rows || '<text x="22" y="114" fill="#737373" font-family="system-ui, sans-serif" font-size="13">No spending in this period</text>'}
</svg>`

  return {
    type: 'image' as const,
    data: await svgToPng(svg, width),
    mimeType: 'image/png',
  }
}
