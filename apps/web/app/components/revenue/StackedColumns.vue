<!--
  Kolom bertumpuk per sumber (skill dataviz): kolom <= 24px, ujung data
  membulat 4px dan rata di baseline, celah 2px warna permukaan antar-segmen,
  grid hairline, satu sumbu. Hover/fokus: crosshair mencari bucket terdekat,
  tooltip menampilkan SEMUA seri (nilai dulu, nama kemudian). Nilai negatif
  (refund/koreksi) bertumpuk ke bawah dari garis nol.
  Tanpa library: SVG yang mengikuti lebar wadah (ResizeObserver).
-->
<script setup lang="ts">
export interface ColumnSeries {
  key: string
  name: string
  color: string
  values: number[]
}

const props = withDefaults(defineProps<{
  labels: string[]
  series: ColumnSeries[]
  currency: string
  height?: number
  /** Nama grafik untuk pembaca layar. */
  title: string
}>(), { height: 260 })

const wrap = ref<HTMLElement | null>(null)
const width = ref(720)
let observer: ResizeObserver | null = null
onMounted(() => {
  if (!wrap.value) return
  width.value = wrap.value.clientWidth || 720
  observer = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width
    if (w) width.value = w
  })
  observer.observe(wrap.value)
})
onBeforeUnmount(() => observer?.disconnect())

const M = { top: 12, right: 8, bottom: 26, left: 68 }
const GAP = 2

const n = computed(() => props.labels.length)
const plotW = computed(() => Math.max(10, width.value - M.left - M.right))
const plotH = computed(() => props.height - M.top - M.bottom)
const band = computed(() => plotW.value / Math.max(1, n.value))
const barW = computed(() => Math.max(2, Math.min(24, band.value * 0.68)))

const totals = computed(() => props.labels.map((_, i) => {
  let pos = 0
  let neg = 0
  for (const s of props.series) {
    const v = s.values[i] ?? 0
    if (v >= 0) pos += v
    else neg += v
  }
  return { pos, neg, net: pos + neg }
}))

/** Angka "bulat" untuk tick: 1, 2, 2.5, 5 x 10^k. */
function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count)
  const pow = 10 ** Math.floor(Math.log10(raw || 1))
  const steps = [1, 2, 2.5, 5, 10]
  return (steps.find((s) => s * pow >= raw) ?? 10) * pow
}

const scale = computed(() => {
  const max = Math.max(0, ...totals.value.map((t) => t.pos))
  const min = Math.min(0, ...totals.value.map((t) => t.neg))
  const step = niceStep(max - min || 1, 4)
  const top = Math.ceil(max / step) * step || step
  const bottom = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = bottom; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  const y = (v: number) => M.top + plotH.value - ((v - bottom) / (top - bottom)) * plotH.value
  return { top, bottom, ticks, y }
})

interface Seg { key: string; x: number; y: number; h: number; color: string; round: 'top' | 'bottom' | null }

/** Segmen per bucket; segmen terluar (atas untuk positif, bawah untuk negatif) dibulatkan. */
const segments = computed<Seg[]>(() => {
  const out: Seg[] = []
  const { y } = scale.value
  props.labels.forEach((_, i) => {
    const x = M.left + band.value * i + (band.value - barW.value) / 2
    let pos = 0
    let neg = 0
    const pending: Seg[] = []
    let lastPos: Seg | null = null
    let lastNeg: Seg | null = null
    for (const s of props.series) {
      const v = s.values[i] ?? 0
      if (!v) continue
      if (v > 0) {
        const y0 = y(pos)
        const y1 = y(pos + v)
        const seg: Seg = { key: s.key, x, y: y1, h: Math.max(0, y0 - y1 - (pos > 0 ? GAP : 0)), color: s.color, round: null }
        pos += v
        lastPos = seg
        pending.push(seg)
      } else {
        const y0 = y(neg)
        const y1 = y(neg + v)
        const seg: Seg = { key: s.key, x, y: y0 + (neg < 0 ? GAP : 0), h: Math.max(0, y1 - y0 - (neg < 0 ? GAP : 0)), color: s.color, round: null }
        neg += v
        lastNeg = seg
        pending.push(seg)
      }
    }
    if (lastPos) lastPos.round = 'top'
    if (lastNeg) lastNeg.round = 'bottom'
    out.push(...pending)
  })
  return out
})

/** Path persegi dengan dua sudut membulat di ujung data saja (baseline tetap siku). */
function segPath(s: Seg): string {
  const r = Math.min(4, barW.value / 2, s.h)
  const { x, y, h } = s
  const w = barW.value
  if (s.round === 'top' && r > 0) return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
  if (s.round === 'bottom' && r > 0) return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`
  return `M${x},${y}h${w}v${h}h${-w}Z`
}

/** Label sumbu X yang tidak bertabrakan: kira-kira satu per 80px. */
const xLabels = computed(() => {
  const every = Math.max(1, Math.ceil(n.value / Math.max(1, Math.floor(plotW.value / 80))))
  return props.labels.map((label, i) => ({ label, i, x: M.left + band.value * (i + 0.5) })).filter((l) => l.i % every === 0 || l.i === n.value - 1 && n.value <= 14)
})

const active = ref<number | null>(null)

function onMove(e: PointerEvent) {
  const svg = e.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * width.value
  const i = Math.floor((x - M.left) / band.value)
  active.value = i >= 0 && i < n.value ? i : null
}

function onKey(e: KeyboardEvent) {
  if (!n.value) return
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    const cur = active.value ?? (e.key === 'ArrowRight' ? -1 : n.value)
    active.value = Math.min(n.value - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)))
  } else if (e.key === 'Home') {
    active.value = 0
  } else if (e.key === 'End') {
    active.value = n.value - 1
  } else if (e.key === 'Escape') {
    active.value = null
  }
}

const tooltip = computed(() => {
  const i = active.value
  if (i === null) return null
  const rows = props.series
    .map((s) => ({ key: s.key, name: s.name, color: s.color, value: s.values[i] ?? 0 }))
    .filter((r) => r.value !== 0)
    .sort((a, b) => b.value - a.value)
  const cx = M.left + band.value * (i + 0.5)
  return { i, label: props.labels[i] ?? '', rows, total: totals.value[i]?.net ?? 0, cx, left: cx > width.value * 0.6 }
})

const summary = computed(() => {
  const sum = totals.value.reduce((acc, t) => acc + t.net, 0)
  return `${props.title}: ${n.value} titik, total ${formatMoney(sum, props.currency)}. Gunakan panah kiri/kanan untuk membaca per titik.`
})
</script>

<template>
  <div
    ref="wrap"
    class="rv-chart"
  >
    <svg
      :viewBox="`0 0 ${width} ${height}`"
      :width="width"
      :height="height"
      role="img"
      tabindex="0"
      :aria-label="summary"
      @pointermove="onMove"
      @pointerleave="active = null"
      @keydown="onKey"
      @blur="active = null"
    >
      <g class="rv-chart__grid">
        <template
          v-for="t in scale.ticks"
          :key="t"
        >
          <line
            :x1="M.left"
            :x2="width - M.right"
            :y1="scale.y(t)"
            :y2="scale.y(t)"
            :class="{ 'is-zero': t === 0 }"
          />
          <text
            :x="M.left - 8"
            :y="scale.y(t)"
            text-anchor="end"
            dominant-baseline="middle"
          >{{ formatMoneyCompact(t, currency) }}</text>
        </template>
      </g>
      <rect
        v-if="tooltip"
        class="rv-chart__band"
        :x="M.left + band * tooltip.i"
        :y="M.top"
        :width="band"
        :height="plotH"
      />
      <path
        v-for="(s, k) in segments"
        :key="k"
        :d="segPath(s)"
        :fill="s.color"
      />
      <line
        v-if="tooltip"
        class="rv-chart__cross"
        :x1="tooltip.cx"
        :x2="tooltip.cx"
        :y1="M.top"
        :y2="M.top + plotH"
      />
      <g class="rv-chart__x">
        <text
          v-for="l in xLabels"
          :key="l.i"
          :x="l.x"
          :y="height - 6"
          text-anchor="middle"
        >{{ l.label }}</text>
      </g>
    </svg>
    <div
      v-if="tooltip"
      class="rv-tip"
      :class="{ 'rv-tip--left': tooltip.left }"
      :style="{ left: `${tooltip.cx}px` }"
      role="status"
    >
      <div class="rv-tip__head">
        {{ tooltip.label }}
      </div>
      <div class="rv-tip__total">
        {{ formatMoney(tooltip.total, currency) }}
      </div>
      <ul v-if="series.length > 1">
        <li
          v-for="r in tooltip.rows"
          :key="r.key"
        >
          <span
            class="rv-tip__key"
            :style="{ background: r.color }"
          />
          <strong>{{ formatMoney(r.value, currency) }}</strong>
          <span>{{ r.name }}</span>
        </li>
        <li
          v-if="!tooltip.rows.length"
          class="muted"
        >
          Tidak ada pemasukan
        </li>
      </ul>
    </div>
  </div>
</template>
