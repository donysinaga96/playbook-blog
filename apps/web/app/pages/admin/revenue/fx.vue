<!--
  Kurs (ADR-011): 1 <mata uang> = N <mata uang utama>, berlaku mulai tanggal
  sampai ada kurs lebih baru. Entri memakai kurs terakhir <= tanggal
  laporannya, dan kurs itu disimpan di entri (angka lama tidak berubah
  diam-diam). "Isi yang kosong" mengonversi entri tanpa kurs; "Hitung
  ulang" menerapkan kurs terbaru ke rentang tertentu (tercatat sebagai revisi).
-->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface FxData { baseCurrency: string; rates: { currency: string; rateDate: string; rate: string; note: string | null }[]; missing: { currency: string; entries: number; firstDate: string }[] }

const nav = useRevenueNav()
const today = computed(() => todayIn(nav.value?.settings.timeZone ?? 'Asia/Jakarta'))
const { data, refresh, error } = await useAsyncData('revenue-fx', () => revenueApi<FxData>('fx'), { server: false })

const form = reactive({ currency: 'USD', rateDate: `${today.value.slice(0, 7)}-01`, rate: '', note: '' })
const recompute = reactive({ currency: 'USD', from: `${today.value.slice(0, 7)}-01`, to: today.value })
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const busy = ref(false)

async function run(fn: () => Promise<string>) {
  busy.value = true
  message.value = null
  try {
    message.value = { kind: 'ok', text: await fn() }
    await refresh()
  } catch (e) {
    message.value = { kind: 'error', text: apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}

const save = () => run(async () => {
  await revenueApi('fx', { method: 'POST', body: { currency: form.currency.toUpperCase(), rateDate: form.rateDate, rate: form.rate.trim().replace(',', '.'), note: form.note || null } })
  form.rate = ''
  const r = await revenueApi<{ updated: number }>('fx/recompute', { method: 'POST', body: { mode: 'missing' } })
  return `Kurs disimpan. ${r.updated} entri yang belum dikonversi kini terkonversi.`
})
const fillMissing = () => run(async () => `${(await revenueApi<{ updated: number }>('fx/recompute', { method: 'POST', body: { mode: 'missing' } })).updated} entri dikonversi.`)
const recomputeRange = () => run(async () => `${(await revenueApi<{ updated: number }>('fx/recompute', { method: 'POST', body: { mode: 'range', ...recompute, currency: recompute.currency.toUpperCase() } })).updated} entri dihitung ulang (versi lama tersimpan di riwayat).`)
const remove = (currency: string, rateDate: string) => run(async () => {
  await revenueApi('fx/delete', { method: 'POST', body: { currency, rateDate } })
  return 'Kurs dihapus. Entri yang sudah dikonversi tidak berubah.'
})

useHead({ title: 'Kurs · Pendapatan' })
</script>

<template>
  <div>
    <header class="adm-head">
      <h1>Kurs ke {{ data?.baseCurrency ?? 'mata uang utama' }}</h1>
    </header>
    <p
      v-if="error"
      class="notice notice--error"
    >
      {{ apiErrorMessage(error) }}
    </p>
    <p
      v-if="message"
      class="notice"
      :class="{ 'notice--error': message.kind === 'error' }"
      role="status"
    >
      {{ message.text }}
    </p>

    <p
      v-for="m in data?.missing ?? []"
      :key="m.currency"
      class="notice rv-warn"
    >
      {{ formatNumber(m.entries) }} entri {{ m.currency }} (sejak {{ formatDay(m.firstDate, true) }}) belum dikonversi.
      Tambahkan kurs {{ m.currency }} bertanggal paling lambat {{ formatDay(m.firstDate, true) }}.
    </p>

    <div class="adm-split">
      <section class="adm-panel">
        <h2>Tambah atau ubah kurs</h2>
        <form
          class="stack"
          @submit.prevent="save"
        >
          <div class="row">
            <label class="field">
              <span>Mata uang</span>
              <input
                v-model="form.currency"
                type="text"
                maxlength="3"
                required
              >
            </label>
            <label class="field">
              <span>Berlaku mulai</span>
              <input
                v-model="form.rateDate"
                type="date"
                required
              >
            </label>
            <label class="field">
              <span>1 {{ form.currency || '…' }} = ? {{ data?.baseCurrency }}</span>
              <input
                v-model="form.rate"
                type="text"
                inputmode="decimal"
                required
                placeholder="16250"
              >
            </label>
          </div>
          <label class="field">
            <span>Catatan (mis. sumber kurs)</span>
            <input
              v-model="form.note"
              type="text"
              maxlength="200"
            >
          </label>
          <div class="rv-actions">
            <button
              type="submit"
              class="btn btn--primary"
              :disabled="busy"
            >
              Simpan kurs
            </button>
            <button
              type="button"
              class="btn"
              :disabled="busy"
              @click="fillMissing"
            >
              Konversi entri yang belum berkurs
            </button>
          </div>
        </form>
      </section>
      <section class="adm-panel">
        <h2>Hitung ulang rentang</h2>
        <p class="field__hint">
          Untuk koreksi kurs: entri di rentang ini memakai kurs terbaru yang berlaku pada tanggalnya. Koreksi/refund manual tidak diubah.
        </p>
        <form
          class="stack"
          @submit.prevent="recomputeRange"
        >
          <div class="row">
            <label class="field"><span>Mata uang</span><input
              v-model="recompute.currency"
              type="text"
              maxlength="3"
              required
            ></label>
            <label class="field"><span>Dari</span><input
              v-model="recompute.from"
              type="date"
              required
            ></label>
            <label class="field"><span>Sampai</span><input
              v-model="recompute.to"
              type="date"
              required
            ></label>
          </div>
          <div class="rv-actions">
            <button
              type="submit"
              class="btn"
              :disabled="busy"
            >
              Hitung ulang
            </button>
          </div>
        </form>
      </section>
    </div>

    <section class="rv-section">
      <div class="rv-section__head">
        <h2>Daftar kurs</h2>
      </div>
      <table class="table rv-num">
        <thead>
          <tr>
            <th>Mata uang</th>
            <th>Berlaku mulai</th>
            <th>Kurs</th>
            <th>Catatan</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in data?.rates ?? []"
            :key="`${r.currency}-${r.rateDate}`"
          >
            <td>{{ r.currency }}</td>
            <td>{{ formatDay(r.rateDate, true) }}</td>
            <td>{{ formatNumber(r.rate, 4) }} {{ data?.baseCurrency }}</td>
            <td class="muted">
              {{ r.note ?? '' }}
            </td>
            <td>
              <button
                type="button"
                class="btn btn--ghost btn--small btn--danger"
                :disabled="busy"
                @click="remove(r.currency, r.rateDate)"
              >
                Hapus
              </button>
            </td>
          </tr>
          <tr v-if="data && !data.rates.length">
            <td
              colspan="5"
              class="muted"
            >
              Belum ada kurs. Pendapatan USD (AdSense, Adsterra, Whop) baru masuk total setelah kurs diisi.
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
