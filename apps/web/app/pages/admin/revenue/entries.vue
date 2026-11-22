<!--
  Transaksi: seluruh ledger dengan filter dan pencarian, plus form input
  manual (pemasukan non-API seperti brand deal) dan adjustment rekonsiliasi.
  Adjustment wajib alasan; semua input tercatat dengan pembuatnya.
  ?baru=1 membuka form; ?sumber=<kode> memilih sumber; ?entri=<id> membuka detail.
-->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

const route = useRoute()
const nav = useRevenueNav()
const today = computed(() => todayIn(nav.value?.settings.timeZone ?? 'Asia/Jakarta'))
const sources = computed(() => nav.value?.sources ?? [])
const properties = computed(() => (nav.value?.properties ?? []).filter((p) => p.status === 'ACTIVE'))

const preset = ref<PresetKey>('90d')
const range = reactive(presetRange('90d', today.value))
function choosePreset(key: PresetKey) {
  preset.value = key
  Object.assign(range, presetRange(key, today.value))
}
const filter = reactive({
  source: typeof route.query['sumber'] === 'string' ? route.query['sumber'] : '',
  status: '',
  channel: '',
  q: '',
})
const q = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
watch(() => filter.q, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    q.value = v
  }, 300)
})

const table = ref<{ refresh: () => Promise<void> } | null>(null)

// ---------- form manual ----------
const formOpen = ref(route.query['baru'] === '1')
const form = reactive({
  kind: 'income' as 'income' | 'adjustment',
  sourceCode: typeof route.query['sumber'] === 'string' ? route.query['sumber'] : 'lainnya',
  reportDate: today.value,
  amount: '',
  currency: nav.value?.settings.baseCurrency ?? 'IDR',
  status: 'finalized' as 'finalized' | 'estimated',
  description: '',
  note: '',
  propertyId: '',
  externalId: '',
})
watch(() => form.sourceCode, (c) => {
  const s = sources.value.find((x) => x.code === c)
  if (s) form.currency = s.defaultCurrency
})
const errors = ref<Record<string, string>>({})
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const busy = ref(false)

async function submit() {
  busy.value = true
  errors.value = {}
  message.value = null
  try {
    await revenueApi('entries', {
      method: 'POST',
      body: {
        ...form,
        amount: form.amount.trim().replace(',', '.'),
        propertyId: form.propertyId || null,
        externalId: form.externalId.trim() || null,
        note: form.note.trim() || null,
      },
    })
    message.value = { kind: 'ok', text: form.kind === 'adjustment' ? 'Adjustment dicatat.' : 'Pemasukan dicatat.' }
    Object.assign(form, { amount: '', description: '', note: '', externalId: '' })
    await table.value?.refresh()
  } catch (e) {
    errors.value = apiFieldErrors(e)
    message.value = { kind: 'error', text: apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}
const err = (f: string) => fieldError(errors.value, f)

useHead({ title: 'Transaksi · Pendapatan' })
</script>

<template>
  <div>
    <header class="adm-head">
      <h1>Transaksi</h1>
      <div class="adm-head__actions">
        <button
          type="button"
          class="btn btn--primary"
          :aria-expanded="formOpen"
          @click="formOpen = !formOpen"
        >
          {{ formOpen ? 'Tutup form' : 'Catat pemasukan atau adjustment' }}
        </button>
      </div>
    </header>

    <section
      v-if="formOpen"
      class="adm-panel rv-form"
      aria-labelledby="form-manual"
    >
      <h2 id="form-manual">
        Input manual
      </h2>
      <div
        class="adm-segmented"
        role="radiogroup"
        aria-label="Jenis"
      >
        <button
          type="button"
          role="radio"
          :aria-checked="form.kind === 'income'"
          :class="{ 'is-on': form.kind === 'income' }"
          @click="form.kind = 'income'"
        >
          Pemasukan
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="form.kind === 'adjustment'"
          :class="{ 'is-on': form.kind === 'adjustment' }"
          @click="form.kind = 'adjustment'"
        >
          Adjustment (koreksi)
        </button>
      </div>
      <p class="field__hint">
        {{ form.kind === 'income'
          ? 'Untuk pemasukan tanpa API, mis. brand deal, sponsor, transfer langsung.'
          : 'Untuk koreksi rekonsiliasi: nominal boleh negatif, alasan wajib. Entri asli tidak diubah.' }}
      </p>
      <form
        class="stack"
        @submit.prevent="submit"
      >
        <div class="row">
          <label class="field">
            <span>Sumber</span>
            <select v-model="form.sourceCode">
              <option
                v-for="s in sources"
                :key="s.code"
                :value="s.code"
              >{{ s.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Situs</span>
            <select v-model="form.propertyId">
              <option value="">Tidak spesifik</option>
              <option
                v-for="p in properties"
                :key="p.id"
                :value="p.id"
              >{{ p.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Tanggal laporan</span>
            <input
              v-model="form.reportDate"
              type="date"
              required
              :aria-invalid="Boolean(err('reportDate'))"
            >
            <span
              v-if="err('reportDate')"
              class="field__error"
            >{{ err('reportDate') }}</span>
          </label>
        </div>
        <div class="row">
          <label class="field">
            <span>Nominal</span>
            <input
              v-model="form.amount"
              type="text"
              inputmode="decimal"
              required
              :placeholder="form.kind === 'income' ? '1500000' : '-150000'"
              :aria-invalid="Boolean(err('amount'))"
            >
            <span class="field__hint">Titik untuk desimal, tanpa pemisah ribuan.</span>
            <span
              v-if="err('amount')"
              class="field__error"
            >{{ err('amount') }}</span>
          </label>
          <label class="field">
            <span>Mata uang</span>
            <input
              v-model="form.currency"
              type="text"
              maxlength="3"
              required
              :aria-invalid="Boolean(err('currency'))"
            >
          </label>
          <label
            v-if="form.kind === 'income'"
            class="field"
          >
            <span>Status angka</span>
            <select v-model="form.status">
              <option value="finalized">Final (sudah diterima)</option>
              <option value="estimated">Sementara (belum diterima)</option>
            </select>
          </label>
        </div>
        <label class="field">
          <span>Keterangan</span>
          <input
            v-model="form.description"
            type="text"
            required
            maxlength="500"
            :aria-invalid="Boolean(err('description'))"
          >
          <span
            v-if="err('description')"
            class="field__error"
          >{{ err('description') }}</span>
        </label>
        <div class="row">
          <label class="field">
            <span>{{ form.kind === 'adjustment' ? 'Alasan (wajib)' : 'Catatan (opsional)' }}</span>
            <textarea
              v-model="form.note"
              :required="form.kind === 'adjustment'"
              :aria-invalid="Boolean(err('note'))"
            />
            <span
              v-if="err('note')"
              class="field__error"
            >{{ err('note') }}</span>
          </label>
          <label
            v-if="form.kind === 'income'"
            class="field"
          >
            <span>No. invoice/ID (opsional)</span>
            <input
              v-model="form.externalId"
              type="text"
              maxlength="200"
              :aria-invalid="Boolean(err('externalId'))"
            >
            <span class="field__hint">Mencegah pemasukan yang sama tercatat dua kali.</span>
            <span
              v-if="err('externalId')"
              class="field__error"
            >{{ err('externalId') }}</span>
          </label>
        </div>
        <p
          v-if="message"
          class="notice"
          :class="{ 'notice--error': message.kind === 'error' }"
          role="status"
        >
          {{ message.text }}
        </p>
        <div class="rv-actions">
          <button
            type="submit"
            class="btn btn--primary"
            :disabled="busy"
          >
            {{ form.kind === 'adjustment' ? 'Catat adjustment' : 'Catat pemasukan' }}
          </button>
        </div>
      </form>
    </section>

    <div
      class="rv-filters"
      role="group"
      aria-label="Filter transaksi"
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
        @change="preset = 'custom'"
      ></label>
      <span class="muted">s.d.</span>
      <label class="rv-date"><span class="sr-only">Sampai</span><input
        v-model="range.to"
        type="date"
        @change="preset = 'custom'"
      ></label>
      <label><span class="sr-only">Sumber</span><select v-model="filter.source">
        <option value="">Semua sumber</option>
        <option
          v-for="s in sources"
          :key="s.code"
          :value="s.code"
        >{{ s.name }}</option>
      </select></label>
      <label><span class="sr-only">Status</span><select v-model="filter.status">
        <option value="">Semua status</option>
        <option value="estimated">Sementara</option>
        <option value="finalized">Final</option>
        <option value="adjusted">Koreksi</option>
        <option value="refunded">Refund</option>
      </select></label>
      <label><span class="sr-only">Jalur</span><select v-model="filter.channel">
        <option value="">Semua jalur</option>
        <option
          v-for="(label, key) in CHANNEL_TEXT"
          :key="key"
          :value="key"
        >{{ label }}</option>
      </select></label>
      <label><span class="sr-only">Cari</span><input
        v-model="filter.q"
        type="search"
        placeholder="Cari keterangan, ID, domain"
      ></label>
    </div>

    <RevenueEntriesTable
      ref="table"
      :sources="filter.source ? [filter.source] : []"
      :statuses="filter.status"
      :channel="filter.channel"
      :q="q"
      :from="range.from"
      :to="range.to"
      :open-id="typeof route.query.entri === 'string' ? route.query.entri : null"
    />
  </div>
</template>
