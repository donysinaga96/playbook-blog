<!--
  Tabel entri ledger dengan halaman (dipakai halaman Transaksi dan detail
  sumber). Klik baris membuka panel detail: angka asli + kurs, metrik,
  dimensi, riwayat revisi, koreksi/refund, payload mentah, dan aksi refund.
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  sources?: string[]
  from: string
  to: string
  statuses?: string
  property?: string
  q?: string
  channel?: string
  pageSize?: number
  /** Buka detail entri ini saat dimuat (?entri=<id>). */
  openId?: string | null
}>(), { sources: () => [], statuses: '', property: '', q: '', channel: '', pageSize: 25, openId: null })

const emit = defineEmits<{ changed: [] }>()

interface Entry { id: string; sourceCode: string; sourceName: string; channelType: string; reportDate: string; occurredAt: string | null; grossAmount: string; currency: string; normalizedAmount: string | null; status: LedgerStatus; description: string | null; propertyName: string | null; revision: number; externalId: string | null; dimensions: Record<string, string> }
interface PageData { items: Entry[]; page: number; total: number; totalPages: number }

const nav = useRevenueNav()
const base = computed(() => nav.value?.settings.baseCurrency ?? 'IDR')
const allSources = computed(() => nav.value?.sources ?? [])
const page = ref(1)
const query = computed(() => ({ from: props.from, to: props.to, sources: props.sources.join(','), statuses: props.statuses, property: props.property, q: props.q, channel: props.channel, page: page.value, pageSize: props.pageSize }))
watch(() => [props.from, props.to, props.sources.join(), props.statuses, props.property, props.q, props.channel], () => {
  page.value = 1
})

// Dipanggil halaman induk setelah input manual; diisi setelah data dimuat.
let reload: () => Promise<void> = async () => {}
defineExpose({ refresh: () => reload() })

const { data, error, refresh, pending } = await useAsyncData(
  () => `revenue-entries-${JSON.stringify(query.value)}`,
  () => revenueApi<PageData>('entries', { query: query.value }),
  { server: false, watch: [query] },
)

/** Situs (atau domain belum dipetakan), placement, revisi dalam satu baris. */
function entryContext(e: Entry): string {
  const parts: string[] = []
  if (e.propertyName) parts.push(e.propertyName)
  else if (e.dimensions.domain) parts.push(`${e.dimensions.domain} (belum dipetakan)`)
  if (e.dimensions.placement) parts.push(`placement ${e.dimensions.placement}`)
  if (e.revision > 1) parts.push(`revisi ${e.revision}`)
  return parts.join(', ')
}

// ---------- detail ----------
interface EntryDetail {
  entry: Record<string, unknown> & { id: string; sourceName: string; channelType: string; idempotencyKey: string; externalId: string | null; reportDate: string; occurredAt: string | null; grossAmount: string; currency: string; fxRateToBase: string | null; baseCurrency: string; normalizedAmount: string | null; status: LedgerStatus; metrics: Record<string, number>; dimensions: Record<string, string>; description: string | null; note: string | null; rawPayload: unknown; adjustsEntryId: string | null; createdByName: string | null; revision: number; createdAt: string; updatedAt: string; propertyName: string | null }
  revisions: { revision: number; grossAmount: string; currency: string; fxRateToBase: string | null; normalizedAmount: string | null; status: LedgerStatus; replacedAt: string }[]
  corrections: { id: string; status: LedgerStatus; grossAmount: string; currency: string; note: string | null; reportDate: string; createdAt: string }[]
}
const dialog = ref<HTMLDialogElement | null>(null)
const detail = ref<EntryDetail | null>(null)
const detailError = ref<string | null>(null)
const refund = reactive({ open: false, amount: '', note: '', busy: false, error: '' })

async function openEntry(id: string) {
  detail.value = null
  detailError.value = null
  refund.open = false
  dialog.value?.showModal()
  try {
    detail.value = await revenueApi<EntryDetail>(`entries/${id}`)
  } catch (e) {
    detailError.value = apiErrorMessage(e)
  }
}
onMounted(() => {
  if (props.openId) void openEntry(props.openId)
})

async function submitRefund() {
  if (!detail.value) return
  refund.busy = true
  refund.error = ''
  try {
    await revenueApi(`entries/${detail.value.entry.id}/refund`, { method: 'POST', body: { amount: refund.amount.trim() || null, note: refund.note } })
    refund.open = false
    refund.amount = ''
    refund.note = ''
    await Promise.all([openEntry(detail.value.entry.id), refresh()])
    emit('changed')
  } catch (e) {
    refund.error = apiErrorMessage(e)
  } finally {
    refund.busy = false
  }
}

const canRefund = computed(() => {
  const e = detail.value?.entry
  return Boolean(e && (e.status === 'finalized' || e.status === 'estimated') && Number(e.grossAmount) > 0)
})

reload = refresh
</script>

<template>
  <div :class="{ 'is-loading': pending && data }">
    <p
      v-if="error"
      class="notice notice--error"
      role="alert"
    >
      {{ apiErrorMessage(error) }}
    </p>
    <div class="table-scroll">
      <table class="table rv-num">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Sumber</th>
            <th>Keterangan</th>
            <th>Nominal</th>
            <th class="hide-sm">
              {{ base }}
            </th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="e in data?.items ?? []"
            :key="e.id"
          >
            <td class="nowrap">
              {{ formatDay(e.reportDate, true) }}
            </td>
            <td class="nowrap">
              <span
                class="rv-dot"
                :style="{ background: colorFor(e.sourceCode, allSources) }"
              />{{ e.sourceName }}
              <div class="muted rv-small">
                {{ CHANNEL_TEXT[e.channelType] ?? e.channelType }}
              </div>
            </td>
            <td>
              <button
                type="button"
                class="table__title rv-linkbtn"
                @click="openEntry(e.id)"
              >
                {{ e.description ?? e.externalId ?? 'Tanpa keterangan' }}
              </button>
              <div class="muted rv-small">
                {{ entryContext(e) }}
              </div>
            </td>
            <td class="nowrap">
              {{ formatMoney(e.grossAmount, e.currency, { precise: true }) }}
            </td>
            <td class="nowrap hide-sm">
              {{ e.normalizedAmount === null ? 'belum dikonversi' : formatMoney(e.normalizedAmount, base) }}
            </td>
            <td>
              <span :class="['rv-badge', `rv-badge--${e.status}`]">{{ STATUS_TEXT[e.status] }}</span>
            </td>
          </tr>
          <tr v-if="data && !data.items.length">
            <td
              colspan="6"
              class="muted"
            >
              Tidak ada entri untuk filter ini.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="data && data.totalPages > 1"
      class="pager"
    >
      <button
        type="button"
        class="btn btn--small"
        :disabled="page <= 1"
        @click="page--"
      >
        Sebelumnya
      </button>
      <span class="muted">Halaman {{ data.page }} dari {{ data.totalPages }} ({{ formatNumber(data.total) }} entri)</span>
      <button
        type="button"
        class="btn btn--small"
        :disabled="page >= data.totalPages"
        @click="page++"
      >
        Berikutnya
      </button>
    </div>

    <dialog
      ref="dialog"
      class="adm-dialog rv-drawer"
      aria-labelledby="entri-judul"
      @close="detail = null"
    >
      <div class="stack">
        <div class="adm-head">
          <h2 id="entri-judul">
            Detail entri
          </h2>
          <div class="adm-head__actions">
            <button
              type="button"
              class="btn btn--small"
              @click="dialog?.close()"
            >
              Tutup
            </button>
          </div>
        </div>
        <p
          v-if="detailError"
          class="notice notice--error"
        >
          {{ detailError }}
        </p>
        <p
          v-else-if="!detail"
          class="muted"
        >
          Memuat…
        </p>
        <template v-else>
          <div>
            <p class="rv-hero__value rv-drawer__amount">
              {{ formatMoney(detail.entry.grossAmount, detail.entry.currency, { precise: true }) }}
            </p>
            <p class="muted">
              {{ detail.entry.description }}
            </p>
            <span :class="['rv-badge', `rv-badge--${detail.entry.status}`]">{{ STATUS_TEXT[detail.entry.status] }}</span>
          </div>
          <div class="rv-conn">
            <dl>
              <dt>Sumber</dt>
              <dd>{{ detail.entry.sourceName }} ({{ CHANNEL_TEXT[detail.entry.channelType] }})</dd>
              <dt>Situs</dt>
              <dd>{{ detail.entry.propertyName ?? 'Belum dipetakan' }}</dd>
              <dt>Tanggal laporan</dt>
              <dd>{{ formatDay(detail.entry.reportDate, true) }}</dd>
              <dt v-if="detail.entry.occurredAt">
                Waktu transaksi
              </dt>
              <dd v-if="detail.entry.occurredAt">
                {{ formatTime(detail.entry.occurredAt) }}
              </dd>
              <dt>Dalam {{ detail.entry.baseCurrency }}</dt>
              <dd>
                {{ detail.entry.normalizedAmount === null ? `belum dikonversi (kurs ${detail.entry.currency} belum ada)` : formatMoney(detail.entry.normalizedAmount, detail.entry.baseCurrency) }}
                <span
                  v-if="detail.entry.fxRateToBase && detail.entry.currency !== detail.entry.baseCurrency"
                  class="muted"
                > (kurs {{ formatNumber(detail.entry.fxRateToBase, 4) }})</span>
              </dd>
              <dt>ID eksternal</dt>
              <dd class="mono">
                {{ detail.entry.externalId ?? '-' }}
              </dd>
              <dt>Kunci idempotensi</dt>
              <dd class="mono">
                {{ detail.entry.idempotencyKey }}
              </dd>
              <template
                v-for="(v, k) in detail.entry.dimensions"
                :key="`d-${k}`"
              >
                <dt>{{ k }}</dt>
                <dd>{{ v }}</dd>
              </template>
              <template
                v-for="(v, k) in detail.entry.metrics"
                :key="`m-${k}`"
              >
                <dt>{{ k }}</dt>
                <dd>{{ formatNumber(v, 3) }}</dd>
              </template>
              <dt v-if="detail.entry.note">
                Catatan audit
              </dt>
              <dd v-if="detail.entry.note">
                {{ detail.entry.note }}
              </dd>
              <dt>Dicatat</dt>
              <dd>{{ formatTime(detail.entry.createdAt) }}{{ detail.entry.createdByName ? ` oleh ${detail.entry.createdByName}` : '' }}; revisi {{ detail.entry.revision }}</dd>
            </dl>
          </div>

          <section v-if="detail.revisions.length">
            <h3>Riwayat angka</h3>
            <table class="table rv-num">
              <thead>
                <tr>
                  <th>Revisi</th>
                  <th>Nominal</th>
                  <th>Status</th>
                  <th>Diganti</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in detail.revisions"
                  :key="r.revision"
                >
                  <td>{{ r.revision }}</td>
                  <td>{{ formatMoney(r.grossAmount, r.currency, { precise: true }) }}</td>
                  <td>{{ STATUS_TEXT[r.status] }}</td>
                  <td>{{ formatTime(r.replacedAt) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section v-if="detail.corrections.length">
            <h3>Koreksi dan refund</h3>
            <ul>
              <li
                v-for="c in detail.corrections"
                :key="c.id"
              >
                {{ STATUS_TEXT[c.status] }} {{ formatMoney(c.grossAmount, c.currency) }}, {{ formatDay(c.reportDate, true) }}: {{ c.note }}
              </li>
            </ul>
          </section>

          <section v-if="canRefund">
            <button
              v-if="!refund.open"
              type="button"
              class="btn btn--danger"
              @click="refund.open = true"
            >
              Catat refund
            </button>
            <form
              v-else
              class="stack"
              @submit.prevent="submitRefund"
            >
              <label class="field">
                <span>Nominal refund ({{ detail.entry.currency }})</span>
                <input
                  v-model="refund.amount"
                  type="text"
                  inputmode="decimal"
                  placeholder="Kosongkan untuk refund penuh"
                >
              </label>
              <label class="field">
                <span>Alasan (wajib, tersimpan sebagai catatan audit)</span>
                <textarea
                  v-model="refund.note"
                  required
                />
              </label>
              <p
                v-if="refund.error"
                class="field__error"
              >
                {{ refund.error }}
              </p>
              <div class="rv-actions">
                <button
                  type="submit"
                  class="btn btn--danger"
                  :disabled="refund.busy"
                >
                  Simpan refund
                </button>
                <button
                  type="button"
                  class="btn btn--ghost"
                  @click="refund.open = false"
                >
                  Batal
                </button>
              </div>
            </form>
          </section>

          <details v-if="detail.entry.rawPayload">
            <summary>Payload mentah (audit)</summary>
            <pre class="rv-pre">{{ JSON.stringify(detail.entry.rawPayload, null, 2) }}</pre>
          </details>
        </template>
      </div>
    </dialog>
  </div>
</template>
