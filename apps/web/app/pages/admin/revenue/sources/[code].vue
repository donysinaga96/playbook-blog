<!--
  Detail satu sumber pemasukan (ADR-011). Bagian umum: total, tren harian,
  breakdown per dimensi, transaksi terbaru. Bagian khusus per connector:
    Adsterra  impressions, clicks, CTR, eCPM; riwayat tarik API
    AdSense   page views, clicks, page RPM; status OAuth; riwayat sync
    Lynk.id   order, rata-rata order; URL + status webhook; event masuk
    lainnya   jumlah entri; riwayat impor file
-->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface Run { id: string; channelType: string; trigger: string; status: string; mock: boolean; rangeStart: string; rangeEnd: string; startedAt: string; finishedAt: string | null; rowsFetched: number; inserted: number; updated: number; unchanged: number; skipped: number; failed: number; errorMessage: string | null; log: string[] }
interface WebhookEvent { id: string; receivedAt: string; eventType: string | null; externalEventId: string | null; signatureValid: boolean; status: string; error: string | null; test: boolean; ledgerEntryId: string | null }
interface ImportRow { id: string; fileName: string; fileFormat: string; status: string; rowCount: number; inserted: number; updated: number; unchanged: number; skipped: number; failed: number; createdAt: string }
interface Detail {
  source: SourceInfo
  range: { start: string; end: string }
  detail: {
    range: { from: string; to: string; previousFrom: string; previousTo: string }
    baseCurrency: string
    total: string
    gross: string | null
    currencies: string[]
    entries: number
    previousTotal: string
    metrics: Record<string, string>
    daily: { date: string; amount: string; gross: string; status: string; entries: number }[]
    breakdowns: { key: string; rows: { value: string; amount: string; gross: string; entries: number; metrics: Record<string, number> }[] }[]
    runs: Run[]
    webhooks: WebhookEvent[]
    imports: ImportRow[]
  }
}

const route = useRoute()
const code = computed(() => String(route.params['code']))
const nav = useRevenueNav()
const today = computed(() => todayIn(nav.value?.settings.timeZone ?? 'Asia/Jakarta'))

const preset = ref<PresetKey>('30d')
const range = reactive(presetRange('30d', today.value))
function choosePreset(key: PresetKey) {
  preset.value = key
  Object.assign(range, presetRange(key, today.value))
}

const query = computed(() => ({ from: range.from, to: range.to }))
const { data, error, refresh, pending } = await useAsyncData(
  () => `revenue-source-${code.value}-${range.from}-${range.to}`,
  () => revenueApi<Detail>(`sources/${code.value}`, { query: query.value }),
  { server: false, watch: [query, code] },
)
const last = shallowRef<Detail | null>(null)
watch(data, (d) => {
  if (d) last.value = d
}, { immediate: true })
watch(code, () => {
  last.value = null
})

const source = computed(() => last.value?.source ?? null)
const d = computed(() => last.value?.detail ?? null)
const currency = computed(() => d.value?.baseCurrency ?? 'IDR')
const sources = computed(() => nav.value?.sources ?? [])
const color = computed(() => colorFor(code.value, sources.value))
const change = computed(() => (d.value ? changeRatio(d.value.total, d.value.previousTotal) : null))
const nativeCurrency = computed(() => (d.value?.currencies.length === 1 ? d.value.currencies[0] ?? null : null))

const m = (key: string) => Number(d.value?.metrics[key] ?? 0)
const gross = computed(() => Number(d.value?.gross ?? 0))

/** KPI khusus per connector; nilai uang dalam mata uang asli sumber. */
const kpis = computed(() => {
  const s = source.value
  if (!s || !d.value) return []
  const cur = nativeCurrency.value ?? s.defaultCurrency
  if (s.connector === 'adsterra') {
    const imp = m('impressions')
    const clicks = m('clicks')
    return [
      { label: 'Impressions', value: formatNumber(imp) },
      { label: 'Clicks', value: formatNumber(clicks) },
      { label: 'CTR', value: imp ? `${formatNumber((clicks / imp) * 100, 2)}%` : '-' },
      { label: 'eCPM', value: imp ? formatMoney((gross.value / imp) * 1000, cur, { precise: true }) : '-', note: 'revenue / impressions x 1000' },
    ]
  }
  if (s.connector === 'adsense') {
    const pv = m('pageViews')
    const clicks = m('clicks')
    return [
      { label: 'Page views', value: formatNumber(pv) },
      { label: 'Clicks', value: formatNumber(clicks) },
      { label: 'Impressions', value: formatNumber(m('impressions')) },
      { label: 'Page RPM', value: pv ? formatMoney((gross.value / pv) * 1000, cur) : '-', note: 'estimated earnings / page views x 1000' },
    ]
  }
  if (s.connector === 'lynk') {
    const orders = m('orders')
    return [
      { label: 'Order', value: formatNumber(orders) },
      { label: 'Item terjual', value: formatNumber(m('items')) },
      { label: 'Rata-rata per order', value: orders ? formatMoney(gross.value / orders, cur) : '-', note: 'nominal bersih (grandTotal)' },
      { label: 'Potongan biaya', value: formatMoney(Math.abs(m('convenienceFee')), cur), note: 'convenienceFee' },
    ]
  }
  return [{ label: 'Entri', value: formatNumber(d.value.entries) }]
})

const daily = computed(() => {
  if (!d.value) return { labels: [] as string[], values: [] as number[] }
  const map = new Map(d.value.daily.map((x) => [x.date, Number(x.amount)]))
  const dates = bucketsFor(d.value.range.from, d.value.range.to, 'day')
  return { labels: dates.map((x) => formatDay(x)), values: dates.map((x) => map.get(x) ?? 0) }
})

const DIMENSION_TEXT: Record<string, string> = { domain: 'Domain', placement: 'Placement', country: 'Negara', sub_id: 'Sub ID', product: 'Produk' }
const breakdownKey = ref<string>('')
watch(d, (v) => {
  if (v && !v.breakdowns.some((b) => b.key === breakdownKey.value)) breakdownKey.value = v.breakdowns[0]?.key ?? ''
}, { immediate: true })
const breakdown = computed(() => d.value?.breakdowns.find((b) => b.key === breakdownKey.value) ?? null)

// ---------- aksi ----------
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const busy = ref<string | null>(null)
const syncRange = reactive({ from: '', to: '' })

async function act(name: string, fn: () => Promise<string>) {
  busy.value = name
  message.value = null
  try {
    message.value = { kind: 'ok', text: await fn() }
  } catch (e) {
    message.value = { kind: 'error', text: apiErrorMessage(e) }
  } finally {
    busy.value = null
  }
}

const syncNow = (custom = false) => act('sync', async () => {
  const body = custom && syncRange.from && syncRange.to ? { from: syncRange.from, to: syncRange.to } : {}
  const r = await revenueApi<{ status: string; mock: boolean; range: { start: string; end: string }; counts: { inserted: number; updated: number; unchanged: number; skipped: number; failed: number }; error: string | null }>(`sources/${code.value}/sync`, { method: 'POST', body })
  await Promise.all([refresh(), refreshRevenueNav()])
  if (r.status === 'failed') throw new Error(r.error ?? 'Sync gagal')
  const c = r.counts
  return `Sync ${formatRange(r.range.start, r.range.end)}${r.mock ? ' (mock)' : ''}: ${c.inserted} baru, ${c.updated} diperbarui, ${c.unchanged} sama, ${c.skipped} dilewati, ${c.failed} gagal.`
}).catch(() => {})

const testConnection = () => act('test', async () => {
  const r = await revenueApi<{ ok: boolean; mock: boolean; message: string }>(`sources/${code.value}/test`, { method: 'POST' })
  if (!r.ok) throw new Error(r.message)
  return `${r.mock ? 'Mode mock. ' : ''}${r.message}`
})

const testWebhook = () => act('webhook', async () => {
  const r = await revenueApi<{ ok: boolean; status: string; message?: string }>(`sources/${code.value}/webhook-test`, { method: 'POST' })
  await refresh()
  if (!r.ok) throw new Error(r.message ?? r.status)
  return r.message ?? 'Event uji diterima.'
})

async function copy(text: string) {
  await navigator.clipboard?.writeText(text).catch(() => {})
  message.value = { kind: 'ok', text: 'URL webhook disalin.' }
}

const RUN_TEXT: Record<string, string> = { running: 'Berjalan', success: 'Berhasil', partial: 'Sebagian gagal', failed: 'Gagal' }
const HOOK_TEXT: Record<string, string> = { processed: 'Diproses', duplicate: 'Duplikat', ignored: 'Diabaikan', rejected: 'Ditolak', failed: 'Gagal' }
const runTone = (s: string) => (s === 'success' ? 'good' : s === 'partial' || s === 'running' ? 'warning' : 'critical')
const hookTone = (s: string) => (s === 'processed' || s === 'duplicate' ? 'good' : s === 'ignored' ? 'off' : 'critical')
const openLog = ref<string | null>(null)

useHead({ title: () => (source.value ? `${source.value.name} · Pendapatan` : 'Sumber pendapatan') })
</script>

<template>
  <div
    class="rv"
    :class="{ 'is-loading': pending && last }"
  >
    <p
      v-if="error && !last"
      class="notice notice--error"
      role="alert"
    >
      {{ apiErrorMessage(error) }}
    </p>
    <template v-if="source && d">
      <header class="adm-head">
        <div>
          <h1>
            <span
              class="rv-dot"
              :style="{ background: color }"
            />{{ source.name }}
          </h1>
          <p class="muted rv-sub">
            {{ CHANNEL_TEXT[source.integrationType] }}<template v-if="source.mock">
              , mode mock (data contoh dari adapter)
            </template><template v-if="!source.isActive">
              , nonaktif
            </template>
          </p>
        </div>
        <div class="adm-head__actions">
          <button
            v-if="source.connector === 'lynk'"
            type="button"
            class="btn"
            :disabled="busy !== null"
            @click="testWebhook"
          >
            {{ busy === 'webhook' ? 'Mengirim…' : 'Kirim event uji' }}
          </button>
          <button
            v-if="source.connector !== 'generic'"
            type="button"
            class="btn"
            :disabled="busy !== null"
            @click="testConnection"
          >
            {{ busy === 'test' ? 'Menguji…' : 'Uji koneksi' }}
          </button>
          <NuxtLink
            v-if="source.connector === 'generic'"
            :to="`/admin/revenue/import?sumber=${source.code}`"
            class="btn"
          >
            Impor file
          </NuxtLink>
          <NuxtLink
            :to="`/admin/revenue/entries?baru=1&sumber=${source.code}`"
            class="btn"
          >
            Catat manual
          </NuxtLink>
          <button
            v-if="source.canSync"
            type="button"
            class="btn btn--primary"
            :disabled="busy !== null"
            @click="syncNow(false)"
          >
            {{ busy === 'sync' ? 'Menarik data…' : 'Tarik data sekarang' }}
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
        aria-label="Rentang tanggal"
      >
        <div
          class="adm-segmented"
          role="radiogroup"
          aria-label="Rentang"
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
        <label class="rv-date"><span class="sr-only">Dari</span><input
          v-model="range.from"
          type="date"
          :max="range.to"
          @change="preset = 'custom'"
        ></label>
        <span class="muted">s.d.</span>
        <label class="rv-date"><span class="sr-only">Sampai</span><input
          v-model="range.to"
          type="date"
          :min="range.from"
          @change="preset = 'custom'"
        ></label>
      </div>

      <section class="rv-kpis rv-num">
        <div>
          <h3>Pendapatan ({{ currency }})</h3>
          <p>{{ formatMoney(d.total, currency) }}</p>
          <small><span :class="['rv-delta', change === null ? '' : change >= 0 ? 'is-up' : 'is-down']">{{ formatChange(change) }}</span> vs periode sebelumnya</small>
        </div>
        <div v-if="nativeCurrency && nativeCurrency !== currency">
          <h3>Nominal asli ({{ nativeCurrency }})</h3>
          <p>{{ formatMoney(d.gross, nativeCurrency) }}</p>
          <small>sebelum konversi kurs</small>
        </div>
        <div
          v-for="k in kpis"
          :key="k.label"
        >
          <h3>{{ k.label }}</h3>
          <p>{{ k.value }}</p>
          <small v-if="k.note">{{ k.note }}</small>
        </div>
      </section>

      <section
        class="rv-section"
        aria-labelledby="src-trend"
      >
        <div class="rv-section__head">
          <h2 id="src-trend">
            Pendapatan harian ({{ currency }})
          </h2>
        </div>
        <RevenueStackedColumns
          :labels="daily.labels"
          :series="[{ key: source.code, name: source.name, color, values: daily.values }]"
          :currency="currency"
          :height="220"
          :title="`Pendapatan harian ${source.name}`"
        />
      </section>

      <section
        v-if="d.breakdowns.length"
        class="rv-section"
        aria-labelledby="src-breakdown"
      >
        <div class="rv-section__head">
          <h2 id="src-breakdown">
            Rincian
          </h2>
          <div
            class="adm-segmented"
            role="radiogroup"
            aria-label="Dimensi"
          >
            <button
              v-for="b in d.breakdowns"
              :key="b.key"
              type="button"
              role="radio"
              :aria-checked="breakdownKey === b.key"
              :class="{ 'is-on': breakdownKey === b.key }"
              @click="breakdownKey = b.key"
            >
              {{ DIMENSION_TEXT[b.key] ?? b.key }}
            </button>
          </div>
        </div>
        <div
          v-if="breakdown"
          class="table-scroll"
        >
          <table class="table rv-num">
            <thead>
              <tr>
                <th>{{ DIMENSION_TEXT[breakdown.key] ?? breakdown.key }}</th>
                <th>Pendapatan</th>
                <th v-if="nativeCurrency && nativeCurrency !== currency">
                  {{ nativeCurrency }}
                </th>
                <th v-if="source.connector === 'adsterra' || source.connector === 'adsense'">
                  Impressions
                </th>
                <th v-if="source.connector === 'adsterra' || source.connector === 'adsense'">
                  Clicks
                </th>
                <th v-if="source.connector === 'adsense'">
                  Page views
                </th>
                <th v-if="source.connector === 'lynk'">
                  Order
                </th>
                <th>Entri</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in breakdown.rows"
                :key="row.value"
              >
                <td>
                  {{ row.value }}
                  <span
                    class="rv-meter"
                    aria-hidden="true"
                  ><span :style="{ width: `${Math.max(0, Number(row.amount)) / Math.max(1, ...breakdown.rows.map((r) => Number(r.amount))) * 100}%`, background: color }" /></span>
                </td>
                <td class="nowrap">
                  {{ formatMoney(row.amount, currency) }}
                </td>
                <td
                  v-if="nativeCurrency && nativeCurrency !== currency"
                  class="nowrap"
                >
                  {{ formatMoney(row.gross, nativeCurrency) }}
                </td>
                <td v-if="source.connector === 'adsterra' || source.connector === 'adsense'">
                  {{ formatNumber(row.metrics.impressions) }}
                </td>
                <td v-if="source.connector === 'adsterra' || source.connector === 'adsense'">
                  {{ formatNumber(row.metrics.clicks) }}
                </td>
                <td v-if="source.connector === 'adsense'">
                  {{ formatNumber(row.metrics.pageViews) }}
                </td>
                <td v-if="source.connector === 'lynk'">
                  {{ formatNumber(row.metrics.orders) }}
                </td>
                <td>{{ formatNumber(row.entries) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="rv-split">
        <section
          class="rv-section"
          aria-labelledby="src-conn"
        >
          <div class="rv-section__head">
            <h2 id="src-conn">
              {{ source.connector === 'lynk' ? 'Webhook' : source.canSync ? 'Koneksi API' : 'Cara pengisian' }}
            </h2>
            <NuxtLink
              :to="`/admin/revenue/connections#${source.code}`"
              class="rv-more"
            >
              Pengaturan
            </NuxtLink>
          </div>
          <div class="rv-conn">
            <dl>
              <template v-if="source.connector === 'lynk'">
                <dt>URL webhook</dt>
                <dd>
                  <code class="mono">{{ source.webhookUrl }}</code>
                  <button
                    type="button"
                    class="btn btn--ghost btn--small"
                    @click="copy(source.webhookUrl ?? '')"
                  >
                    Salin
                  </button>
                </dd>
                <dt>Tanda tangan</dt>
                <dd>Header X-Lynk-Signature, diverifikasi dengan merchant key</dd>
                <dt>Event terakhir</dt>
                <dd>{{ d.webhooks[0] ? `${HOOK_TEXT[d.webhooks[0].status] ?? d.webhooks[0].status}, ${formatAgo(d.webhooks[0].receivedAt)}` : 'Belum ada' }}</dd>
              </template>
              <template v-if="source.connector === 'adsense'">
                <dt>Akun</dt>
                <dd class="mono">
                  {{ source.config.accountId ?? (source.mock ? 'accounts/pub-0000000000000000 (mock)' : 'belum diisi') }}
                </dd>
                <dt>Status OAuth</dt>
                <dd>{{ source.mock ? 'Mode mock (tanpa OAuth)' : source.credentials.configured ? 'Client ID, secret, dan refresh token terpasang' : 'Belum lengkap' }}</dd>
                <dt>Final setelah</dt>
                <dd>tanggal {{ source.config.finalizeDay ?? 7 }} bulan berikutnya</dd>
              </template>
              <template v-if="source.canSync">
                <dt>Jadwal</dt>
                <dd>{{ source.syncIntervalMinutes ? `setiap ${source.syncIntervalMinutes} menit` : 'manual' }}{{ nav?.schedulerEnabled ? '' : ' (penjadwal server mati)' }}</dd>
                <dt>Jendela ulang</dt>
                <dd>{{ source.lookbackDays }} hari terakhir ditarik ulang (angka bisa direvisi sumber)</dd>
                <dt>Sync terakhir</dt>
                <dd>{{ source.lastSyncAt ? `${RUN_TEXT[source.lastSyncStatus ?? ''] ?? source.lastSyncStatus}, ${formatAgo(source.lastSyncAt)}` : 'Belum pernah' }}</dd>
              </template>
              <template v-if="source.credentials.required.length">
                <dt>Kredensial (env server)</dt>
                <dd>
                  <div
                    v-for="name in source.credentials.required"
                    :key="name"
                  >
                    <span :class="['rv-status', source.credentials.missing.includes(name) ? 'rv-status--warning' : 'rv-status--good']">
                      <span aria-hidden="true">{{ source.credentials.missing.includes(name) ? '!' : '✓' }}</span>
                      {{ source.credentials.missing.includes(name) ? 'Belum diisi' : 'Terpasang' }}
                    </span>
                    <code class="mono">{{ name }}</code>
                  </div>
                </dd>
              </template>
              <template v-if="source.connector === 'generic'">
                <dt>Diisi lewat</dt>
                <dd>Impor file CSV/Excel/JSON atau input manual</dd>
              </template>
            </dl>
            <form
              v-if="source.canSync"
              class="rv-actions"
              @submit.prevent="syncNow(true)"
            >
              <label class="rv-date"><span class="sr-only">Tarik ulang dari</span><input
                v-model="syncRange.from"
                type="date"
                required
              ></label>
              <label class="rv-date"><span class="sr-only">sampai</span><input
                v-model="syncRange.to"
                type="date"
                required
              ></label>
              <button
                type="submit"
                class="btn btn--small"
                :disabled="busy !== null"
              >
                Tarik ulang rentang ini
              </button>
            </form>
          </div>
        </section>

        <section
          class="rv-section"
          aria-labelledby="src-log"
        >
          <div class="rv-section__head">
            <h2 id="src-log">
              {{ source.connector === 'lynk' ? 'Event masuk' : source.canSync ? 'Riwayat tarik data' : 'Riwayat impor' }}
            </h2>
          </div>
          <div class="table-scroll">
            <table
              v-if="source.connector === 'lynk'"
              class="table rv-num"
            >
              <thead>
                <tr>
                  <th>Diterima</th>
                  <th>Status</th>
                  <th>Message ID</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="w in d.webhooks.slice(0, 12)"
                  :key="w.id"
                >
                  <td class="nowrap">
                    {{ formatTime(w.receivedAt) }}
                  </td>
                  <td>
                    <span :class="['rv-status', `rv-status--${hookTone(w.status)}`]">{{ HOOK_TEXT[w.status] ?? w.status }}{{ w.test ? ' (uji)' : '' }}</span>
                    <div
                      v-if="w.error"
                      class="muted rv-small"
                    >
                      {{ w.error }}
                    </div>
                  </td>
                  <td class="mono rv-small">
                    {{ w.externalEventId ?? '-' }}
                  </td>
                </tr>
                <tr v-if="!d.webhooks.length">
                  <td
                    colspan="3"
                    class="muted"
                  >
                    Belum ada webhook. Pasang URL di dashboard Lynk.id, lalu tekan Kirim event uji.
                  </td>
                </tr>
              </tbody>
            </table>
            <table
              v-else-if="source.canSync"
              class="table rv-num"
            >
              <thead>
                <tr>
                  <th>Mulai</th>
                  <th>Status</th>
                  <th>Rentang</th>
                  <th>Hasil</th>
                </tr>
              </thead>
              <tbody>
                <template
                  v-for="r in d.runs.slice(0, 10)"
                  :key="r.id"
                >
                  <tr>
                    <td class="nowrap">
                      {{ formatTime(r.startedAt) }}
                      <div class="muted rv-small">
                        {{ r.trigger === 'schedule' ? 'jadwal' : r.trigger === 'cli' ? 'CLI' : 'manual' }}{{ r.mock ? ', mock' : '' }}
                      </div>
                    </td>
                    <td>
                      <span :class="['rv-status', `rv-status--${runTone(r.status)}`]">{{ RUN_TEXT[r.status] ?? r.status }}</span>
                    </td>
                    <td class="nowrap rv-small">
                      {{ formatRange(r.rangeStart, r.rangeEnd) }}
                    </td>
                    <td class="rv-small">
                      {{ r.inserted }} baru, {{ r.updated }} diperbarui, {{ r.unchanged }} sama<template v-if="r.failed">
                        , {{ r.failed }} gagal
                      </template>
                      <button
                        type="button"
                        class="btn btn--ghost btn--small"
                        :aria-expanded="openLog === r.id"
                        @click="openLog = openLog === r.id ? null : r.id"
                      >
                        Log
                      </button>
                    </td>
                  </tr>
                  <tr v-if="openLog === r.id">
                    <td colspan="4">
                      <p
                        v-if="r.errorMessage"
                        class="notice notice--error"
                      >
                        {{ r.errorMessage }}
                      </p>
                      <pre class="rv-log">{{ r.log.join('\n') }}</pre>
                    </td>
                  </tr>
                </template>
                <tr v-if="!d.runs.length">
                  <td
                    colspan="4"
                    class="muted"
                  >
                    Belum pernah ditarik.
                  </td>
                </tr>
              </tbody>
            </table>
            <table
              v-else
              class="table rv-num"
            >
              <thead>
                <tr>
                  <th>File</th>
                  <th>Status</th>
                  <th>Hasil</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="b in d.imports.slice(0, 10)"
                  :key="b.id"
                >
                  <td>
                    {{ b.fileName }}
                    <div class="muted rv-small">
                      {{ formatTime(b.createdAt) }}
                    </div>
                  </td>
                  <td>{{ b.status === 'committed' ? 'Masuk ledger' : b.status === 'uploaded' ? 'Belum di-commit' : b.status === 'discarded' ? 'Dibuang' : 'Gagal' }}</td>
                  <td class="rv-small">
                    {{ b.inserted }} baru, {{ b.updated }} diperbarui, {{ b.unchanged }} sama, {{ b.skipped }} dilewati, {{ b.failed }} galat
                  </td>
                </tr>
                <tr v-if="!d.imports.length">
                  <td
                    colspan="3"
                    class="muted"
                  >
                    Belum ada impor.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section
        class="rv-section"
        aria-labelledby="src-entries"
      >
        <div class="rv-section__head">
          <h2 id="src-entries">
            Transaksi dan laporan
          </h2>
          <NuxtLink
            :to="`/admin/revenue/entries?sumber=${source.code}`"
            class="rv-more"
          >
            Buka di Transaksi
          </NuxtLink>
        </div>
        <RevenueEntriesTable
          :sources="[source.code]"
          :from="range.from"
          :to="range.to"
          :page-size="10"
        />
      </section>
    </template>
  </div>
</template>
