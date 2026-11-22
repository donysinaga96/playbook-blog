<!--
  Dashboard pendapatan (ADR-011). Satu baris filter di atas mengatur semua
  angka di bawahnya (rentang, sumber, status, situs). Urutan baca:
    1. total periode + perubahan vs periode sebelumnya + komposisi per sumber
    2. hari ini, bulan ini, angka sementara, rata-rata harian
    3. tren per sumber (grafik atau tabel)
    4. per situs | kesehatan konektor
    5. aktivitas terbaru
  Dipakai /admin (semua situs) dan /admin/revenue/sites/:code (satu situs).
-->
<script setup lang="ts">
const props = defineProps<{ property?: PropertyInfo | null }>()

interface Overview {
  granularity: 'day' | 'week' | 'month'
  overview: {
    range: { from: string; to: string; previousFrom: string; previousTo: string; today: string }
    baseCurrency: string
    total: string
    previousTotal: string
    entries: number
    today: string
    yesterday: string
    monthToDate: string
    previousMonthToDate: string
    byStatus: { status: LedgerStatus; amount: string; entries: number }[]
    bySource: { code: string; name: string; amount: string; previousAmount: string; entries: number }[]
    byProperty: { propertyId: string | null; code: string | null; name: string; domain: string | null; amount: string; previousAmount: string; entries: number }[]
    series: { bucket: string; sourceCode: string; amount: string }[]
    unconverted: { currency: string; entries: number; grossAmount: string }[]
  }
  recent: { id: string; sourceCode: string; sourceName: string; channelType: string; reportDate: string; grossAmount: string; currency: string; normalizedAmount: string | null; status: LedgerStatus; description: string | null; propertyName: string | null; updatedAt: string }[]
  health: { code: string; name: string; connector: string; integrationType: string; isActive: boolean; syncIntervalMinutes: number | null; lastSyncAt: string | null; lastSyncStatus: string | null; lastRun: { status: string; startedAt: string; finishedAt: string | null; errorMessage: string | null; mock: boolean } | null; lastWebhook: { status: string; receivedAt: string; error: string | null } | null; webhookFailures24h: number; lastImport: { status: string; createdAt: string; fileName: string } | null }[]
  sources: SourceInfo[]
  properties: PropertyInfo[]
  settings: { baseCurrency: string; timeZone: string }
}

const nav = useRevenueNav()
const timeZone = computed(() => nav.value?.settings.timeZone ?? 'Asia/Jakarta')
const today = computed(() => todayIn(timeZone.value))

const preset = ref<PresetKey>('30d')
const range = reactive(presetRange('30d', today.value))
const selectedSources = ref<string[]>([])
const statusFilter = ref<'' | 'finalized' | 'estimated'>('')
const propertyFilter = ref<string>('')
const granularity = ref<'auto' | 'day' | 'week' | 'month'>('auto')
const view = ref<'chart' | 'table'>('chart')

function choosePreset(key: PresetKey) {
  preset.value = key
  Object.assign(range, presetRange(key, today.value))
}

const effectiveGranularity = computed(() => {
  if (granularity.value !== 'auto') return granularity.value
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 + 1
  return days <= 62 ? 'day' : days <= 200 ? 'week' : 'month'
})

const query = computed(() => ({
  from: range.from,
  to: range.to,
  sources: selectedSources.value.join(','),
  statuses: statusFilter.value === 'finalized' ? 'finalized,adjusted,refunded' : statusFilter.value === 'estimated' ? 'estimated' : '',
  property: props.property?.id ?? propertyFilter.value,
  granularity: effectiveGranularity.value,
}))

const { data, error, pending, refresh } = await useAsyncData(
  () => `revenue-overview-${JSON.stringify(query.value)}`,
  () => revenueApi<Overview>('overview', { query: query.value }),
  { server: false, watch: [query] },
)
// Bingkai lama dipertahankan saat memuat ulang (tanpa kedipan).
const last = shallowRef<Overview | null>(null)
watch(data, (d) => {
  if (d) last.value = d
}, { immediate: true })
const o = computed(() => last.value?.overview ?? null)
const sources = computed(() => last.value?.sources ?? nav.value?.sources ?? [])
const currency = computed(() => o.value?.baseCurrency ?? 'IDR')

const change = computed(() => (o.value ? changeRatio(o.value.total, o.value.previousTotal) : null))
const mtdChange = computed(() => (o.value ? changeRatio(o.value.monthToDate, o.value.previousMonthToDate) : null))
const todayChange = computed(() => (o.value ? changeRatio(o.value.today, o.value.yesterday) : null))
const estimated = computed(() => o.value?.byStatus.find((s) => s.status === 'estimated'))
const days = computed(() => (o.value ? (Date.parse(o.value.range.to) - Date.parse(o.value.range.from)) / 86_400_000 + 1 : 1))

const parts = computed(() => (o.value?.bySource ?? []).map((s) => ({
  key: s.code, name: s.name, value: Number(s.amount), color: colorFor(s.code, sources.value), ink: inkFor(s.code, sources.value),
})))

const buckets = computed(() => (o.value ? bucketsFor(o.value.range.from, o.value.range.to, last.value?.granularity ?? 'day') : []))
const chartSeries = computed(() => {
  const ov = o.value
  if (!ov) return []
  const index = new Map(buckets.value.map((b, i) => [b, i]))
  return ov.bySource
    .filter((s) => Number(s.amount) !== 0 || ov.series.some((p) => p.sourceCode === s.code))
    .map((s) => {
      const values = buckets.value.map(() => 0)
      for (const p of ov.series) if (p.sourceCode === s.code) {
        const i = index.get(p.bucket)
        if (i !== undefined) values[i] = (values[i] ?? 0) + Number(p.amount)
      }
      return { key: s.code, name: s.name, color: colorFor(s.code, sources.value), values }
    })
})
const labels = computed(() => buckets.value.map((b) => bucketLabel(b, last.value?.granularity ?? 'day')))

const propertyMax = computed(() => Math.max(1, ...(o.value?.byProperty ?? []).map((p) => Number(p.amount))))

type HealthRow = Overview['health'][number]
function healthState(h: HealthRow): { tone: 'good' | 'warning' | 'critical' | 'off'; label: string; detail: string } {
  const source = sources.value.find((s) => s.code === h.code)
  if (!h.isActive) return { tone: 'off', label: 'Nonaktif', detail: 'Tidak ditarik dan tidak menerima webhook' }
  if (h.integrationType === 'webhook') {
    if (h.webhookFailures24h > 0) return { tone: 'critical', label: 'Webhook ditolak', detail: `${h.webhookFailures24h} kiriman gagal/ditolak dalam 24 jam` }
    if (source && !source.mock && !source.credentials.configured) return { tone: 'warning', label: 'Belum dikonfigurasi', detail: `Isi ${source.credentials.missing.join(', ')}` }
    return h.lastWebhook ? { tone: 'good', label: 'Menerima', detail: `Event terakhir ${formatAgo(h.lastWebhook.receivedAt)}` } : { tone: 'warning', label: 'Belum ada event', detail: 'Belum pernah menerima webhook' }
  }
  if (h.lastRun?.status === 'failed') return { tone: 'critical', label: 'Sync gagal', detail: h.lastRun.errorMessage ?? 'Lihat log' }
  if (source?.canSync && !source.mock && !source.credentials.configured) return { tone: 'warning', label: 'Belum dikonfigurasi', detail: `Isi ${source.credentials.missing.join(', ')}` }
  if (h.lastRun) return { tone: h.lastRun.status === 'partial' ? 'warning' : 'good', label: h.lastRun.status === 'partial' ? 'Sebagian gagal' : h.lastRun.mock ? 'OK (mock)' : 'OK', detail: `Sync ${formatAgo(h.lastRun.finishedAt ?? h.lastRun.startedAt)}` }
  if (h.lastImport) return { tone: 'good', label: 'Impor file', detail: `Terakhir ${formatAgo(h.lastImport.createdAt)}` }
  return { tone: 'off', label: 'Manual', detail: 'Diisi lewat input manual atau impor file' }
}
const TONE_ICON = { good: '✓', warning: '!', critical: '×', off: '–' } as const

// ---------- aksi ----------
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const syncing = ref(false)
async function syncAll() {
  syncing.value = true
  message.value = null
  const targets = sources.value.filter((s) => s.canSync && s.isActive)
  const results: string[] = []
  for (const s of targets) {
    try {
      const r = await revenueApi<{ status: string; counts: { inserted: number; updated: number }; error: string | null }>(`sources/${s.code}/sync`, { method: 'POST', body: {} })
      results.push(r.status === 'failed' ? `${s.name}: gagal (${r.error})` : `${s.name}: ${r.counts.inserted} baru, ${r.counts.updated} diperbarui`)
    } catch (e) {
      results.push(`${s.name}: ${apiErrorMessage(e)}`)
    }
  }
  syncing.value = false
  message.value = { kind: results.some((r) => r.includes('gagal') || r.includes('berjalan')) ? 'error' : 'ok', text: results.join('; ') || 'Tidak ada sumber API yang aktif.' }
  await Promise.all([refresh(), refreshRevenueNav()])
}

const sourcesOpen = ref(false)
function toggleSource(code: string) {
  selectedSources.value = selectedSources.value.includes(code) ? selectedSources.value.filter((c) => c !== code) : [...selectedSources.value, code]
}
const sourceSummary = computed(() => {
  if (!selectedSources.value.length) return 'Semua sumber'
  if (selectedSources.value.length === 1) return sources.value.find((s) => s.code === selectedSources.value[0])?.name ?? '1 sumber'
  return `${selectedSources.value.length} sumber`
})
</script>

<template>
  <div
    class="rv"
    :class="{ 'is-loading': pending && last }"
  >
    <header class="adm-head">
      <div>
        <h1>{{ property ? property.name : 'Pendapatan semua situs' }}</h1>
        <p
          v-if="property"
          class="muted rv-sub"
        >
          {{ property.domain ?? 'tanpa domain' }}<template v-if="property.siteCode">
            , dilayani framework (site {{ property.siteCode }})
          </template>
        </p>
      </div>
      <div class="adm-head__actions">
        <NuxtLink
          to="/admin/revenue/entries?baru=1"
          class="btn"
        >
          Catat pemasukan
        </NuxtLink>
        <NuxtLink
          to="/admin/revenue/import"
          class="btn"
        >
          Impor file
        </NuxtLink>
        <button
          type="button"
          class="btn btn--primary"
          :disabled="syncing"
          @click="syncAll"
        >
          {{ syncing ? 'Menarik data…' : 'Tarik data API sekarang' }}
        </button>
      </div>
    </header>

    <p
      v-if="message"
      class="notice"
      :class="{ 'notice--error': message.kind === 'error' }"
      role="status"
    >
      {{ message.text }}
    </p>

    <div
      class="rv-filters"
      role="group"
      aria-label="Filter dashboard"
    >
      <div
        class="adm-segmented rv-presets"
        role="radiogroup"
        aria-label="Rentang tanggal"
      >
        <button
          v-for="p in PRESETS"
          :key="p.key"
          type="button"
          role="radio"
          :aria-checked="preset === p.key"
          :class="{ 'is-on': preset === p.key }"
          @click="choosePreset(p.key)"
        >
          {{ p.label }}
        </button>
      </div>
      <label class="rv-date">
        <span class="sr-only">Dari</span>
        <input
          v-model="range.from"
          type="date"
          :max="range.to"
          @change="preset = 'custom'"
        >
      </label>
      <span
        class="muted"
        aria-hidden="true"
      >s.d.</span>
      <label class="rv-date">
        <span class="sr-only">Sampai</span>
        <input
          v-model="range.to"
          type="date"
          :min="range.from"
          :max="today"
          @change="preset = 'custom'"
        >
      </label>
      <details
        class="rv-pop"
        :open="sourcesOpen"
        @toggle="sourcesOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary class="btn">
          {{ sourceSummary }}
        </summary>
        <div class="rv-pop__panel">
          <label
            v-for="s in sources"
            :key="s.code"
            class="check"
          >
            <input
              type="checkbox"
              :checked="selectedSources.includes(s.code)"
              @change="toggleSource(s.code)"
            >
            <span
              class="rv-dot"
              :style="{ background: colorFor(s.code, sources) }"
            />
            {{ s.name }}
          </label>
          <button
            v-if="selectedSources.length"
            type="button"
            class="btn btn--ghost btn--small"
            @click="selectedSources = []"
          >
            Tampilkan semua
          </button>
        </div>
      </details>
      <label>
        <span class="sr-only">Status angka</span>
        <select v-model="statusFilter">
          <option value="">Semua status</option>
          <option value="finalized">Final + koreksi</option>
          <option value="estimated">Sementara saja</option>
        </select>
      </label>
      <label v-if="!property">
        <span class="sr-only">Situs</span>
        <select v-model="propertyFilter">
          <option value="">Semua situs</option>
          <option
            v-for="p in last?.properties ?? []"
            :key="p.id"
            :value="p.id"
          >{{ p.name }}</option>
          <option value="none">Belum dipetakan</option>
        </select>
      </label>
    </div>

    <p
      v-if="error && !last"
      class="notice notice--error"
      role="alert"
    >
      {{ apiErrorMessage(error) }}
    </p>

    <template v-if="o">
      <section
        class="rv-hero"
        aria-labelledby="rv-total"
      >
        <div class="rv-hero__figure">
          <h2
            id="rv-total"
            class="rv-hero__label"
          >
            Total {{ formatRange(o.range.from, o.range.to) }}
          </h2>
          <p class="rv-hero__value">
            {{ formatMoney(o.total, currency) }}
          </p>
          <p class="rv-hero__meta">
            <span
              class="rv-delta"
              :class="change === null ? '' : change >= 0 ? 'is-up' : 'is-down'"
            >{{ formatChange(change) }}</span>
            <span class="muted">dibanding {{ formatRange(o.range.previousFrom, o.range.previousTo) }} ({{ formatMoney(o.previousTotal, currency) }})</span>
          </p>
        </div>
        <RevenueSegmentedBar
          :parts="parts"
          :currency="currency"
        />
        <p
          v-for="u in o.unconverted"
          :key="u.currency"
          class="notice rv-warn"
          role="note"
        >
          {{ formatNumber(u.entries) }} entri {{ u.currency }} ({{ formatMoney(u.grossAmount, u.currency) }}) belum masuk total karena kurs {{ u.currency }} → {{ currency }} belum diisi.
          <NuxtLink to="/admin/revenue/fx">Isi kurs</NuxtLink>
        </p>
      </section>

      <section
        class="rv-stats"
        aria-label="Ringkasan"
      >
        <div class="rv-stat">
          <h3>Hari ini</h3>
          <p class="rv-stat__value">
            {{ formatMoney(o.today, currency) }}
          </p>
          <p class="rv-stat__note">
            <span :class="['rv-delta', todayChange === null ? '' : todayChange >= 0 ? 'is-up' : 'is-down']">{{ formatChange(todayChange) }}</span> vs kemarin
          </p>
        </div>
        <div class="rv-stat">
          <h3>Bulan ini</h3>
          <p class="rv-stat__value">
            {{ formatMoney(o.monthToDate, currency) }}
          </p>
          <p class="rv-stat__note">
            <span :class="['rv-delta', mtdChange === null ? '' : mtdChange >= 0 ? 'is-up' : 'is-down']">{{ formatChange(mtdChange) }}</span> vs bulan lalu di tanggal yang sama
          </p>
        </div>
        <div class="rv-stat">
          <h3>Masih sementara</h3>
          <p class="rv-stat__value">
            {{ formatMoney(estimated?.amount ?? 0, currency) }}
          </p>
          <p class="rv-stat__note">
            {{ formatNumber(estimated?.entries ?? 0) }} entri bisa berubah saat laporan sumber final
          </p>
        </div>
        <div class="rv-stat">
          <h3>Rata-rata per hari</h3>
          <p class="rv-stat__value">
            {{ formatMoney(Number(o.total) / days, currency) }}
          </p>
          <p class="rv-stat__note">
            {{ formatNumber(o.entries) }} entri dalam {{ days }} hari
          </p>
        </div>
      </section>

      <section
        class="rv-section"
        aria-labelledby="rv-trend"
      >
        <div class="rv-section__head">
          <h2 id="rv-trend">
            Tren per sumber
          </h2>
          <div
            class="adm-segmented"
            role="radiogroup"
            aria-label="Satuan waktu"
          >
            <button
              v-for="g in [['auto', 'Otomatis'], ['day', 'Harian'], ['week', 'Mingguan'], ['month', 'Bulanan']] as const"
              :key="g[0]"
              type="button"
              role="radio"
              :aria-checked="granularity === g[0]"
              :class="{ 'is-on': granularity === g[0] }"
              @click="granularity = g[0]"
            >
              {{ g[1] }}
            </button>
          </div>
          <div
            class="adm-segmented"
            role="radiogroup"
            aria-label="Tampilan"
          >
            <button
              type="button"
              role="radio"
              :aria-checked="view === 'chart'"
              :class="{ 'is-on': view === 'chart' }"
              @click="view = 'chart'"
            >
              Grafik
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="view === 'table'"
              :class="{ 'is-on': view === 'table' }"
              @click="view = 'table'"
            >
              Tabel
            </button>
          </div>
        </div>
        <ul
          v-if="chartSeries.length > 1"
          class="rv-legend"
        >
          <li
            v-for="s in chartSeries"
            :key="s.key"
          >
            <span
              class="rv-legend__swatch"
              :style="{ background: s.color }"
            />{{ s.name }}
          </li>
        </ul>
        <RevenueStackedColumns
          v-if="view === 'chart'"
          :labels="labels"
          :series="chartSeries"
          :currency="currency"
          title="Tren pendapatan per sumber"
        />
        <div
          v-else
          class="table-scroll"
        >
          <table class="table rv-num">
            <thead>
              <tr>
                <th>Periode</th>
                <th
                  v-for="s in chartSeries"
                  :key="s.key"
                >
                  {{ s.name }}
                </th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(label, i) in labels"
                :key="label"
              >
                <td class="nowrap">
                  {{ label }}
                </td>
                <td
                  v-for="s in chartSeries"
                  :key="s.key"
                >
                  {{ formatMoney(s.values[i] ?? 0, currency) }}
                </td>
                <td><strong>{{ formatMoney(chartSeries.reduce((n, s) => n + (s.values[i] ?? 0), 0), currency) }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="rv-split">
        <section
          v-if="!property"
          class="rv-section"
          aria-labelledby="rv-sites"
        >
          <div class="rv-section__head">
            <h2 id="rv-sites">
              Per situs
            </h2>
            <NuxtLink
              to="/admin/revenue/sites"
              class="rv-more"
            >
              Kelola situs
            </NuxtLink>
          </div>
          <table class="table rv-num">
            <thead>
              <tr>
                <th>Situs</th>
                <th>Pendapatan</th>
                <th class="hide-sm">
                  Perubahan
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in o.byProperty"
                :key="p.propertyId ?? 'none'"
              >
                <td>
                  <NuxtLink
                    v-if="p.code"
                    :to="`/admin/revenue/sites/${p.code}`"
                  >
                    {{ p.name }}
                  </NuxtLink>
                  <span
                    v-else
                    class="muted"
                  >{{ p.name }}</span>
                  <span
                    class="rv-meter"
                    aria-hidden="true"
                  ><span :style="{ width: `${Math.max(0, Number(p.amount)) / propertyMax * 100}%` }" /></span>
                </td>
                <td class="nowrap">
                  {{ formatMoney(p.amount, currency) }}
                </td>
                <td class="hide-sm nowrap">
                  <span :class="['rv-delta', changeRatio(p.amount, p.previousAmount) === null ? '' : (changeRatio(p.amount, p.previousAmount) ?? 0) >= 0 ? 'is-up' : 'is-down']">{{ formatChange(changeRatio(p.amount, p.previousAmount)) }}</span>
                </td>
              </tr>
              <tr v-if="!o.byProperty.length">
                <td
                  colspan="3"
                  class="muted"
                >
                  Belum ada pemasukan di rentang ini.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section
          v-if="property"
          class="rv-section"
          aria-labelledby="rv-by-source"
        >
          <div class="rv-section__head">
            <h2 id="rv-by-source">
              Per sumber
            </h2>
          </div>
          <table class="table rv-num">
            <thead>
              <tr>
                <th>Sumber</th>
                <th>Pendapatan</th>
                <th>Perubahan</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in o.bySource.filter((x) => Number(x.amount) || Number(x.previousAmount))"
                :key="s.code"
              >
                <td>
                  <span
                    class="rv-dot"
                    :style="{ background: colorFor(s.code, sources) }"
                  />
                  <NuxtLink :to="`/admin/revenue/sources/${s.code}`">{{ s.name }}</NuxtLink>
                </td>
                <td class="nowrap">
                  {{ formatMoney(s.amount, currency) }}
                </td>
                <td class="nowrap">
                  <span :class="['rv-delta', changeRatio(s.amount, s.previousAmount) === null ? '' : (changeRatio(s.amount, s.previousAmount) ?? 0) >= 0 ? 'is-up' : 'is-down']">{{ formatChange(changeRatio(s.amount, s.previousAmount)) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section
          class="rv-section"
          aria-labelledby="rv-health"
        >
          <div class="rv-section__head">
            <h2 id="rv-health">
              Kesehatan konektor
            </h2>
            <NuxtLink
              to="/admin/revenue/connections"
              class="rv-more"
            >
              Koneksi &amp; log
            </NuxtLink>
          </div>
          <ul class="rv-health">
            <li
              v-for="h in last?.health ?? []"
              :key="h.code"
            >
              <span
                class="rv-status"
                :class="`rv-status--${healthState(h).tone}`"
              >
                <span aria-hidden="true">{{ TONE_ICON[healthState(h).tone] }}</span>
                {{ healthState(h).label }}
              </span>
              <NuxtLink :to="`/admin/revenue/sources/${h.code}`">{{ h.name }}</NuxtLink>
              <span class="muted rv-health__detail">{{ healthState(h).detail }}</span>
            </li>
          </ul>
        </section>
      </div>

      <section
        class="rv-section"
        aria-labelledby="rv-recent"
      >
        <div class="rv-section__head">
          <h2 id="rv-recent">
            Aktivitas terbaru
          </h2>
          <NuxtLink
            to="/admin/revenue/entries"
            class="rv-more"
          >
            Semua transaksi
          </NuxtLink>
        </div>
        <div class="table-scroll">
          <table class="table rv-num">
            <thead>
              <tr>
                <th>Masuk</th>
                <th>Sumber</th>
                <th>Keterangan</th>
                <th>Tanggal laporan</th>
                <th>Nominal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in last?.recent ?? []"
                :key="r.id"
              >
                <td class="nowrap muted">
                  {{ formatAgo(r.updatedAt) }}
                </td>
                <td class="nowrap">
                  <span
                    class="rv-dot"
                    :style="{ background: colorFor(r.sourceCode, sources) }"
                  />{{ r.sourceName }}
                  <div class="muted rv-small">
                    {{ CHANNEL_TEXT[r.channelType] ?? r.channelType }}
                  </div>
                </td>
                <td>
                  <NuxtLink :to="`/admin/revenue/entries?entri=${r.id}`">
                    {{ r.description ?? '-' }}
                  </NuxtLink>
                  <span
                    v-if="r.propertyName"
                    class="muted"
                  > ({{ r.propertyName }})</span>
                </td>
                <td class="nowrap">
                  {{ formatDay(r.reportDate, true) }}
                </td>
                <td class="nowrap">
                  {{ formatMoney(r.grossAmount, r.currency, { precise: true }) }}
                  <div
                    v-if="r.currency !== currency"
                    class="muted rv-small"
                  >
                    {{ r.normalizedAmount === null ? 'belum dikonversi' : formatMoney(r.normalizedAmount, currency) }}
                  </div>
                </td>
                <td>
                  <span :class="['rv-badge', `rv-badge--${r.status}`]">{{ STATUS_TEXT[r.status] }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
