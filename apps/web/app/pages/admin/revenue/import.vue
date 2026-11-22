<!--
  Wizard impor CSV / Excel (.xlsx) / JSON (ADR-011):
    1. pilih sumber + unggah file (di-parse di server, belum masuk ledger)
    2. petakan kolom, lalu pratinjau: baris valid, galat per baris,
       duplikat, perkiraan baru vs sudah ada di ledger
    3. commit: hasil inserted / updated / unchanged / skipped / failed
  Impor ulang file yang sama aman (kunci idempotensi per baris).
-->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface Upload { batchId: string; fileName: string; format: string; headers: string[]; rowCount: number; sample: Record<string, string>[]; suggestion: Record<string, unknown>; sameFile: { id: string; fileName: string; status: string; createdAt: string }[] }
interface Preview { rowCount: number; valid: number; willInsert: number; alreadyInLedger: number; errors: { row: number; message: string }[]; errorCount: number; skipped: { row: number; message: string }[]; skippedCount: number; sample: { row: number; reportDate: string; grossAmount: string; currency: string; status: string; description: string | null; externalId: string | null; propertyDomain: string | null }[]; currencies: string[] }
interface Result { counts: { inserted: number; updated: number; unchanged: number; skipped: number; failed: number }; errors: { row: number; message: string }[]; skipped: { row: number; message: string }[] }

const route = useRoute()
const nav = useRevenueNav()
const sources = computed(() => nav.value?.sources ?? [])
const properties = computed(() => (nav.value?.properties ?? []).filter((p) => p.status === 'ACTIVE'))

const step = ref<1 | 2 | 3>(1)
const sourceCode = ref(typeof route.query['sumber'] === 'string' ? route.query['sumber'] : 'whop')
const file = ref<File | null>(null)
const over = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const upload = ref<Upload | null>(null)
const preview = ref<Preview | null>(null)
const result = ref<Result | null>(null)

const mapping = reactive({
  date: '', amount: '', currency: '', currencyFixed: 'USD', externalId: '', status: '', statusFixed: 'finalized' as 'finalized' | 'estimated',
  description: '', property: '', propertyId: '', dateFormat: 'auto' as 'auto' | 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY', decimalSeparator: '.' as '.' | ',',
  impressions: '', clicks: '', orders: '',
})

function pickFile(f: File | null | undefined) {
  file.value = f ?? null
  error.value = null
}

async function send() {
  if (!file.value) return
  busy.value = true
  error.value = null
  try {
    const body = new FormData()
    body.set('file', file.value)
    body.set('sourceCode', sourceCode.value)
    upload.value = await revenueApi<Upload>('imports', { method: 'POST', body })
    const s = upload.value.suggestion as Record<string, string | Record<string, string>>
    const metrics = (s['metrics'] ?? {}) as Record<string, string>
    Object.assign(mapping, {
      date: s['date'] ?? '', amount: s['amount'] ?? '', currency: s['currency'] ?? '', currencyFixed: s['currencyFixed'] ?? 'USD',
      externalId: s['externalId'] ?? '', status: s['status'] ?? '', description: s['description'] ?? '', property: s['property'] ?? '',
      impressions: metrics['impressions'] ?? '', clicks: metrics['clicks'] ?? '', orders: metrics['orders'] ?? '',
    })
    // Tebak pemisah desimal dari contoh nominal ('1.234,56' -> koma).
    const sampleAmount = upload.value.sample.map((r) => r[mapping.amount] ?? '').find(Boolean) ?? ''
    mapping.decimalSeparator = /,\d{1,2}$/.test(sampleAmount) ? ',' : '.'
    preview.value = null
    step.value = 2
    if (mapping.date && mapping.amount) await runPreview()
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}

function mappingBody() {
  const metrics: Record<string, string> = {}
  if (mapping.impressions) metrics['impressions'] = mapping.impressions
  if (mapping.clicks) metrics['clicks'] = mapping.clicks
  if (mapping.orders) metrics['orders'] = mapping.orders
  return {
    date: mapping.date, amount: mapping.amount,
    currency: mapping.currency || null, currencyFixed: mapping.currency ? null : mapping.currencyFixed.toUpperCase() || null,
    externalId: mapping.externalId || null, status: mapping.status || null, statusFixed: mapping.statusFixed,
    description: mapping.description || null, property: mapping.property || null, propertyId: mapping.propertyId || null,
    metrics, dimensions: [], dateFormat: mapping.dateFormat, decimalSeparator: mapping.decimalSeparator,
  }
}

async function runPreview() {
  if (!upload.value) return
  busy.value = true
  error.value = null
  try {
    preview.value = await revenueApi<Preview>(`imports/${upload.value.batchId}/preview`, { method: 'POST', body: { mapping: mappingBody() } })
  } catch (e) {
    preview.value = null
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}

async function commit() {
  if (!upload.value) return
  busy.value = true
  error.value = null
  try {
    result.value = await revenueApi<Result>(`imports/${upload.value.batchId}/commit`, { method: 'POST', body: { mapping: mappingBody() } })
    step.value = 3
    await refreshHistory()
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}

async function discard() {
  if (upload.value) await revenueApi(`imports/${upload.value.batchId}/discard`, { method: 'POST' }).catch(() => {})
  reset()
  await refreshHistory()
}

function reset() {
  step.value = 1
  file.value = null
  upload.value = null
  preview.value = null
  result.value = null
  error.value = null
}

const { data: history, refresh: refreshHistory } = await useAsyncData('revenue-import-history', () => revenueApi<{ imports: { id: string; sourceName: string; fileName: string; fileFormat: string; status: string; rowCount: number; inserted: number; updated: number; unchanged: number; skipped: number; failed: number; createdAt: string; createdByName: string | null }[] }>('runs'), { server: false })

const FIELDS: { key: keyof typeof mapping; label: string; required?: boolean; hint?: string }[] = [
  { key: 'date', label: 'Tanggal', required: true },
  { key: 'amount', label: 'Nominal', required: true, hint: 'Pendapatan bersih yang diterima' },
  { key: 'currency', label: 'Mata uang', hint: 'Kosong = pakai mata uang tetap di bawah' },
  { key: 'externalId', label: 'ID transaksi', hint: 'Disarankan: impor ulang jadi update, bukan duplikat' },
  { key: 'status', label: 'Status', hint: 'paid/completed = final, pending = sementara, refunded = refund, failed = dilewati' },
  { key: 'description', label: 'Keterangan/produk' },
  { key: 'property', label: 'Domain/situs', hint: 'Dicocokkan dengan domain di Kelola situs' },
  { key: 'impressions', label: 'Metrik: impressions' },
  { key: 'clicks', label: 'Metrik: clicks' },
  { key: 'orders', label: 'Metrik: order/qty' },
]

useHead({ title: 'Impor file · Pendapatan' })
</script>

<template>
  <div>
    <header class="adm-head">
      <h1>Impor file</h1>
    </header>
    <ol
      class="rv-steps"
      aria-label="Langkah"
    >
      <li :class="{ 'is-on': step === 1 }">
        Unggah
      </li>
      <li :class="{ 'is-on': step === 2 }">
        Petakan kolom dan periksa
      </li>
      <li :class="{ 'is-on': step === 3 }">
        Hasil
      </li>
    </ol>

    <p
      v-if="error"
      class="notice notice--error"
      role="alert"
    >
      {{ error }}
    </p>

    <section
      v-if="step === 1"
      class="adm-panel"
    >
      <form
        class="stack"
        @submit.prevent="send"
      >
        <label class="field">
          <span>Sumber pemasukan</span>
          <select v-model="sourceCode">
            <option
              v-for="s in sources"
              :key="s.code"
              :value="s.code"
            >{{ s.name }}</option>
          </select>
          <span class="field__hint">Laporan Whop, ekspor jaringan iklan lain, atau rekap afiliasi. Data dari file masuk ke sumber ini.</span>
        </label>
        <label
          class="rv-dropzone"
          :class="{ 'is-over': over }"
          @dragover.prevent="over = true"
          @dragleave="over = false"
          @drop.prevent="over = false; pickFile($event.dataTransfer?.files[0])"
        >
          <strong>{{ file ? file.name : 'Pilih atau tarik file ke sini' }}</strong>
          <span class="muted">CSV (koma, titik koma, atau tab), Excel .xlsx (sheet pertama), atau JSON. Maks. 5 MB, 20.000 baris.</span>
          <input
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.json,text/csv,application/json"
            @change="pickFile(($event.target as HTMLInputElement).files?.[0])"
          >
        </label>
        <div class="rv-actions">
          <button
            type="submit"
            class="btn btn--primary"
            :disabled="!file || busy"
          >
            {{ busy ? 'Membaca file…' : 'Lanjut' }}
          </button>
        </div>
      </form>
    </section>

    <template v-if="step === 2 && upload">
      <p
        v-if="upload.sameFile.length"
        class="notice rv-warn"
      >
        File dengan isi sama pernah diunggah ({{ upload.sameFile[0]?.fileName }}, {{ formatTime(upload.sameFile[0]?.createdAt) }}). Mengimpor ulang aman: baris yang sudah ada tidak digandakan.
      </p>
      <div class="rv-import">
        <section class="adm-panel">
          <h2>Kolom {{ upload.fileName }} ({{ formatNumber(upload.rowCount) }} baris)</h2>
          <form
            class="stack"
            @submit.prevent="runPreview"
          >
            <label
              v-for="f in FIELDS"
              :key="f.key"
              class="field"
            >
              <span>{{ f.label }}{{ f.required ? ' (wajib)' : '' }}</span>
              <select
                v-model="mapping[f.key]"
                :required="f.required"
              >
                <option value="">{{ f.required ? 'Pilih kolom' : 'Tidak dipakai' }}</option>
                <option
                  v-for="h in upload.headers"
                  :key="h"
                  :value="h"
                >{{ h }}</option>
              </select>
              <span
                v-if="f.hint"
                class="field__hint"
              >{{ f.hint }}</span>
            </label>
            <div class="row">
              <label
                v-if="!mapping.currency"
                class="field"
              >
                <span>Mata uang tetap</span>
                <input
                  v-model="mapping.currencyFixed"
                  type="text"
                  maxlength="3"
                >
              </label>
              <label
                v-if="!mapping.status"
                class="field"
              >
                <span>Status semua baris</span>
                <select v-model="mapping.statusFixed">
                  <option value="finalized">Final</option>
                  <option value="estimated">Sementara</option>
                </select>
              </label>
              <label
                v-if="!mapping.property"
                class="field"
              >
                <span>Situs semua baris</span>
                <select v-model="mapping.propertyId">
                  <option value="">Tidak spesifik</option>
                  <option
                    v-for="p in properties"
                    :key="p.id"
                    :value="p.id"
                  >{{ p.name }}</option>
                </select>
              </label>
            </div>
            <div class="row">
              <label class="field">
                <span>Format tanggal</span>
                <select v-model="mapping.dateFormat">
                  <option value="auto">Otomatis (ISO atau tanggal &gt; 12)</option>
                  <option value="YYYY-MM-DD">2026-11-25</option>
                  <option value="DD/MM/YYYY">25/11/2026</option>
                  <option value="MM/DD/YYYY">11/25/2026</option>
                </select>
              </label>
              <label class="field">
                <span>Pemisah desimal</span>
                <select v-model="mapping.decimalSeparator">
                  <option value=".">Titik (1,234.56)</option>
                  <option value=",">Koma (1.234,56)</option>
                </select>
              </label>
            </div>
            <div class="rv-actions">
              <button
                type="submit"
                class="btn"
                :disabled="busy"
              >
                Periksa ulang
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                @click="discard"
              >
                Buang file
              </button>
            </div>
          </form>
        </section>

        <section class="adm-panel">
          <h2>Pratinjau</h2>
          <p
            v-if="!preview"
            class="muted"
          >
            Pilih kolom tanggal dan nominal, lalu Periksa ulang.
          </p>
          <template v-else>
            <ul class="rv-counts rv-num">
              <li><strong>{{ formatNumber(preview.willInsert) }}</strong> baris baru</li>
              <li><strong>{{ formatNumber(preview.alreadyInLedger) }}</strong> sudah ada (diperbarui/sama)</li>
              <li><strong>{{ formatNumber(preview.skippedCount) }}</strong> dilewati</li>
              <li><strong>{{ formatNumber(preview.errorCount) }}</strong> galat</li>
            </ul>
            <p
              v-if="preview.currencies.some((c) => c !== (nav?.settings.baseCurrency ?? 'IDR'))"
              class="field__hint"
            >
              Mata uang {{ preview.currencies.join(', ') }} dikonversi dengan kurs di menu Kurs; tanpa kurs, baris tetap masuk dan ditandai belum dikonversi.
            </p>
            <div class="table-scroll">
              <table class="table rv-num">
                <thead>
                  <tr>
                    <th>Baris</th>
                    <th>Tanggal</th>
                    <th>Nominal</th>
                    <th>Status</th>
                    <th>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="r in preview.sample"
                    :key="r.row"
                  >
                    <td>{{ r.row }}</td>
                    <td class="nowrap">
                      {{ formatDay(r.reportDate, true) }}
                    </td>
                    <td class="nowrap">
                      {{ formatMoney(r.grossAmount, r.currency, { precise: true }) }}
                    </td>
                    <td>{{ STATUS_TEXT[r.status as LedgerStatus] }}</td>
                    <td>
                      {{ r.description ?? '-' }}
                      <div
                        v-if="r.propertyDomain"
                        class="muted rv-small"
                      >
                        {{ r.propertyDomain }}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <details v-if="preview.errorCount">
              <summary>Galat per baris ({{ preview.errorCount }})</summary>
              <ul class="issues">
                <li
                  v-for="e in preview.errors"
                  :key="e.row"
                  class="issues__error"
                >
                  Baris {{ e.row }}: {{ e.message }}
                </li>
              </ul>
            </details>
            <details v-if="preview.skippedCount">
              <summary>Dilewati ({{ preview.skippedCount }})</summary>
              <ul class="issues">
                <li
                  v-for="e in preview.skipped"
                  :key="e.row"
                  class="issues__warning"
                >
                  Baris {{ e.row }}: {{ e.message }}
                </li>
              </ul>
            </details>
            <div class="rv-actions">
              <button
                type="button"
                class="btn btn--primary"
                :disabled="busy || !preview.valid"
                @click="commit"
              >
                Impor {{ formatNumber(preview.valid) }} baris ke ledger
              </button>
            </div>
          </template>
        </section>
      </div>
    </template>

    <section
      v-if="step === 3 && result"
      class="adm-panel"
    >
      <h2>Impor selesai</h2>
      <ul class="rv-counts rv-num">
        <li><strong>{{ result.counts.inserted }}</strong> ditambahkan</li>
        <li><strong>{{ result.counts.updated }}</strong> diperbarui</li>
        <li><strong>{{ result.counts.unchanged }}</strong> sama (tidak berubah)</li>
        <li><strong>{{ result.counts.skipped }}</strong> dilewati</li>
        <li><strong>{{ result.counts.failed }}</strong> galat</li>
      </ul>
      <details v-if="result.errors.length">
        <summary>Galat per baris</summary>
        <ul class="issues">
          <li
            v-for="e in result.errors"
            :key="e.row"
            class="issues__error"
          >
            Baris {{ e.row }}: {{ e.message }}
          </li>
        </ul>
      </details>
      <div class="rv-actions">
        <NuxtLink
          :to="`/admin/revenue/sources/${sourceCode}`"
          class="btn btn--primary"
        >
          Lihat {{ sources.find((s) => s.code === sourceCode)?.name }}
        </NuxtLink>
        <button
          type="button"
          class="btn"
          @click="reset"
        >
          Impor file lain
        </button>
      </div>
    </section>

    <section class="rv-section">
      <div class="rv-section__head">
        <h2>Riwayat impor</h2>
      </div>
      <div class="table-scroll">
        <table class="table rv-num">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Sumber</th>
              <th>File</th>
              <th>Status</th>
              <th>Hasil</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in history?.imports ?? []"
              :key="b.id"
            >
              <td class="nowrap">
                {{ formatTime(b.createdAt) }}
              </td>
              <td>{{ b.sourceName }}</td>
              <td>
                {{ b.fileName }}
                <div class="muted rv-small">
                  {{ b.fileFormat.toUpperCase() }}, {{ formatNumber(b.rowCount) }} baris{{ b.createdByName ? `, oleh ${b.createdByName}` : '' }}
                </div>
              </td>
              <td>{{ b.status === 'committed' ? 'Masuk ledger' : b.status === 'uploaded' ? 'Belum di-commit' : b.status === 'discarded' ? 'Dibuang' : 'Gagal' }}</td>
              <td class="rv-small">
                {{ b.inserted }} baru, {{ b.updated }} diperbarui, {{ b.unchanged }} sama, {{ b.skipped }} dilewati, {{ b.failed }} galat
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
