<!--
  Koneksi & log (ADR-011): pengaturan setiap sumber (aktif, jadwal, jendela
  ulang, konfigurasi non-rahasia), status kredensial dari env server, uji
  koneksi, tarik manual, URL webhook, otomasi headless, sumber baru untuk
  impor/manual, dan log tarik data semua sumber.
  Rahasia (API token, OAuth secret, merchant key) tidak pernah diisi di sini.
-->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface Run { id: string; sourceCode: string; sourceName: string; channelType: string; trigger: string; status: string; mock: boolean; rangeStart: string; rangeEnd: string; startedAt: string; finishedAt: string | null; rowsFetched: number; inserted: number; updated: number; unchanged: number; skipped: number; failed: number; errorMessage: string | null; log: string[] }

const nav = useRevenueNav()
const sources = computed(() => nav.value?.sources ?? [])
const { data: runs, refresh: refreshRuns } = await useAsyncData('revenue-runs', () => revenueApi<{ runs: Run[] }>('runs'), { server: false })

/** Salinan form per sumber; dibuat ulang setiap data sumber berubah. */
const forms = reactive<Record<string, { isActive: boolean; syncIntervalMinutes: string; lookbackDays: number; configText: string; error: string; ok: string; busy: boolean }>>({})
watch(sources, (list) => {
  for (const s of list) {
    forms[s.code] = {
      isActive: s.isActive,
      syncIntervalMinutes: s.syncIntervalMinutes ? String(s.syncIntervalMinutes) : '',
      lookbackDays: s.lookbackDays,
      configText: JSON.stringify(s.config, null, 2),
      error: '',
      ok: '',
      busy: false,
    }
  }
}, { immediate: true })

async function save(s: SourceInfo) {
  const f = forms[s.code]
  if (!f) return
  f.error = ''
  f.ok = ''
  let config: unknown
  try {
    config = JSON.parse(f.configText || '{}')
  } catch {
    f.error = 'Konfigurasi harus JSON yang valid'
    return
  }
  f.busy = true
  try {
    await revenueApi(`sources/${s.code}`, {
      method: 'PUT',
      body: { isActive: f.isActive, syncIntervalMinutes: f.syncIntervalMinutes ? Number(f.syncIntervalMinutes) : null, lookbackDays: Number(f.lookbackDays), config, updatedAt: s.updatedAt },
    })
    await refreshRevenueNav()
    const again = forms[s.code]
    if (again) again.ok = 'Tersimpan.'
  } catch (e) {
    f.error = apiStatus(e) === 409 ? 'Sumber ini sudah diubah di tempat lain. Muat ulang halaman.' : apiErrorMessage(e)
  } finally {
    const again = forms[s.code]
    if (again) again.busy = false
  }
}

async function test(s: SourceInfo) {
  const f = forms[s.code]
  if (!f) return
  f.busy = true
  f.error = ''
  f.ok = ''
  try {
    const r = s.connector === 'lynk'
      ? await revenueApi<{ ok: boolean; message?: string; status: string }>(`sources/${s.code}/webhook-test`, { method: 'POST' })
      : await revenueApi<{ ok: boolean; message: string }>(`sources/${s.code}/test`, { method: 'POST' })
    if (r.ok) f.ok = r.message ?? 'OK'
    else f.error = r.message ?? 'Gagal'
  } catch (e) {
    f.error = apiErrorMessage(e)
  } finally {
    f.busy = false
  }
}

async function sync(s: SourceInfo) {
  const f = forms[s.code]
  if (!f) return
  f.busy = true
  f.error = ''
  f.ok = ''
  try {
    const r = await revenueApi<{ status: string; error: string | null; counts: { inserted: number; updated: number; unchanged: number } }>(`sources/${s.code}/sync`, { method: 'POST', body: {} })
    if (r.status === 'failed') f.error = r.error ?? 'Sync gagal'
    else f.ok = `${r.counts.inserted} baru, ${r.counts.updated} diperbarui, ${r.counts.unchanged} sama.`
    await Promise.all([refreshRuns(), refreshRevenueNav()])
  } catch (e) {
    f.error = apiErrorMessage(e)
  } finally {
    const again = forms[s.code]
    if (again) again.busy = false
  }
}

// ---------- sumber baru ----------
const create = reactive({ code: '', name: '', connector: 'generic' as 'generic' | 'headless', integrationType: 'csv_import' as 'csv_import' | 'manual' | 'headless', defaultCurrency: 'USD', error: '', busy: false })
watch(() => create.connector, (c) => {
  create.integrationType = c === 'headless' ? 'headless' : 'csv_import'
})
async function createSource() {
  create.busy = true
  create.error = ''
  try {
    await revenueApi('sources', { method: 'POST', body: { code: create.code, name: create.name, connector: create.connector, integrationType: create.integrationType, defaultCurrency: create.defaultCurrency.toUpperCase() } })
    Object.assign(create, { code: '', name: '' })
    await refreshRevenueNav()
  } catch (e) {
    create.error = apiErrorMessage(e)
  } finally {
    create.busy = false
  }
}

const CONFIG_HINT: Record<string, string> = {
  adsense: '{ "accountId": "accounts/pub-XXXXXXXX", "finalizeDay": 7, "reportingTimeZone": "ACCOUNT_TIME_ZONE", "withDomain": true, "currencyCode": "USD", "mock": false }',
  adsterra: '{ "groupBy": ["domain", "placement"], "mock": false }  (groupBy maks. 2 dari domain, placement, country, placement_sub_id)',
  lynk: '{ "timezone": "Asia/Jakarta", "propertyId": "<id situs untuk semua penjualan>" }',
  headless: '{ "enabled": false, "scraper": "mock" }  (juga butuh REVENUE_HEADLESS_ENABLED=true di server)',
  generic: '{}',
}
const RUN_TEXT: Record<string, string> = { running: 'Berjalan', success: 'Berhasil', partial: 'Sebagian gagal', failed: 'Gagal' }
const runTone = (s: string) => (s === 'success' ? 'good' : s === 'partial' || s === 'running' ? 'warning' : 'critical')
const openLog = ref<string | null>(null)

useHead({ title: 'Koneksi & log · Pendapatan' })
</script>

<template>
  <div>
    <header class="adm-head">
      <h1>Koneksi &amp; log</h1>
    </header>
    <p class="muted rv-intro">
      Kredensial (API token Adsterra, OAuth AdSense, merchant key Lynk.id) diisi di env server, bukan di sini.
      Halaman ini hanya menunjukkan mana yang sudah terpasang.
      <template v-if="!nav?.schedulerEnabled">
        Penjadwal otomatis mati (REVENUE_SCHEDULER bukan true); jadwal di bawah dipakai `pnpm revenue:sync --due` atau saat penjadwal dinyalakan.
      </template>
    </p>

    <section
      v-for="s in sources"
      :id="s.code"
      :key="s.code"
      class="rv-section rv-source-card"
      :aria-labelledby="`src-${s.code}`"
    >
      <div class="rv-section__head">
        <h2 :id="`src-${s.code}`">
          <span
            class="rv-dot"
            :style="{ background: colorFor(s.code, sources) }"
          />{{ s.name }}
        </h2>
        <span class="muted">{{ CHANNEL_TEXT[s.integrationType] }}</span>
        <span
          v-if="s.mock"
          class="rv-status rv-status--warning"
        ><span aria-hidden="true">!</span> Mode mock</span>
      </div>
      <div
        v-if="forms[s.code]"
        class="rv-conn"
      >
        <dl>
          <template v-if="s.webhookUrl">
            <dt>URL webhook</dt>
            <dd><code class="mono">{{ s.webhookUrl }}</code></dd>
          </template>
          <template v-if="s.credentials.required.length">
            <dt>Env server</dt>
            <dd>
              <div
                v-for="name in s.credentials.required"
                :key="name"
              >
                <span :class="['rv-status', s.credentials.missing.includes(name) ? 'rv-status--warning' : 'rv-status--good']">
                  <span aria-hidden="true">{{ s.credentials.missing.includes(name) ? '!' : '✓' }}</span>
                  {{ s.credentials.missing.includes(name) ? 'Belum diisi' : 'Terpasang' }}
                </span>
                <code class="mono">{{ name }}</code>
              </div>
            </dd>
          </template>
          <template v-if="s.canSync">
            <dt>Sync terakhir</dt>
            <dd>{{ s.lastSyncAt ? `${RUN_TEXT[s.lastSyncStatus ?? ''] ?? s.lastSyncStatus}, ${formatAgo(s.lastSyncAt)}` : 'Belum pernah' }}</dd>
          </template>
        </dl>
        <form
          class="stack"
          @submit.prevent="save(s)"
        >
          <div class="row">
            <label class="check">
              <input
                v-model="forms[s.code]!.isActive"
                type="checkbox"
              >
              Aktif
            </label>
            <label
              v-if="s.canSync"
              class="field"
            >
              <span>Tarik otomatis setiap (menit)</span>
              <input
                v-model="forms[s.code]!.syncIntervalMinutes"
                type="number"
                min="15"
                max="10080"
                placeholder="kosong = manual"
              >
            </label>
            <label
              v-if="s.canSync"
              class="field"
            >
              <span>Tarik ulang N hari terakhir</span>
              <input
                v-model="forms[s.code]!.lookbackDays"
                type="number"
                min="0"
                max="60"
              >
              <span class="field__hint">Angka di luar jendela ini dianggap final.</span>
            </label>
          </div>
          <label
            v-if="s.connector !== 'generic'"
            class="field"
          >
            <span>Konfigurasi (JSON, non-rahasia)</span>
            <textarea
              v-model="forms[s.code]!.configText"
              class="mono"
              spellcheck="false"
            />
            <span class="field__hint mono">{{ CONFIG_HINT[s.connector] }}</span>
          </label>
          <p
            v-if="forms[s.code]!.error"
            class="field__error"
            role="alert"
          >
            {{ forms[s.code]!.error }}
          </p>
          <p
            v-if="forms[s.code]!.ok"
            class="notice"
            role="status"
          >
            {{ forms[s.code]!.ok }}
          </p>
          <div class="rv-actions">
            <button
              type="submit"
              class="btn btn--primary"
              :disabled="forms[s.code]!.busy"
            >
              Simpan pengaturan
            </button>
            <button
              v-if="s.connector !== 'generic'"
              type="button"
              class="btn"
              :disabled="forms[s.code]!.busy"
              @click="test(s)"
            >
              {{ s.connector === 'lynk' ? 'Kirim event uji' : 'Uji koneksi' }}
            </button>
            <button
              v-if="s.canSync"
              type="button"
              class="btn"
              :disabled="forms[s.code]!.busy"
              @click="sync(s)"
            >
              Tarik data sekarang
            </button>
            <NuxtLink
              :to="`/admin/revenue/sources/${s.code}`"
              class="btn btn--ghost"
            >
              Lihat data
            </NuxtLink>
          </div>
        </form>
      </div>
    </section>

    <section
      class="rv-section"
      aria-labelledby="src-baru"
    >
      <div class="rv-section__head">
        <h2 id="src-baru">
          Tambah sumber lain
        </h2>
      </div>
      <form
        class="adm-panel"
        @submit.prevent="createSource"
      >
        <p class="field__hint">
          Untuk pemasukan yang diisi lewat impor file atau input manual (afiliasi, jaringan iklan lain, marketplace),
          atau otomasi browser. Adapter API baru ditambahkan di kode (packages/core/src/revenue/adapters).
        </p>
        <div class="row">
          <label class="field">
            <span>Nama</span>
            <input
              v-model="create.name"
              type="text"
              required
              maxlength="80"
              placeholder="Shopee Affiliate"
            >
          </label>
          <label class="field">
            <span>Kode</span>
            <input
              v-model="create.code"
              type="text"
              required
              pattern="[a-z0-9]+(_[a-z0-9]+)*"
              placeholder="shopee_affiliate"
            >
          </label>
          <label class="field">
            <span>Jalur</span>
            <select v-model="create.connector">
              <option value="generic">Impor file / manual</option>
              <option value="headless">Otomasi browser (nonaktif bawaan)</option>
            </select>
          </label>
          <label class="field">
            <span>Mata uang</span>
            <input
              v-model="create.defaultCurrency"
              type="text"
              maxlength="3"
              required
            >
          </label>
        </div>
        <p
          v-if="create.error"
          class="field__error"
          role="alert"
        >
          {{ create.error }}
        </p>
        <div class="rv-actions">
          <button
            type="submit"
            class="btn btn--primary"
            :disabled="create.busy"
          >
            Tambah sumber
          </button>
        </div>
      </form>
    </section>

    <section
      class="rv-section"
      aria-labelledby="log-sync"
    >
      <div class="rv-section__head">
        <h2 id="log-sync">
          Log tarik data
        </h2>
        <button
          type="button"
          class="btn btn--small"
          @click="refreshRuns()"
        >
          Muat ulang
        </button>
      </div>
      <div class="table-scroll">
        <table class="table rv-num">
          <thead>
            <tr>
              <th>Mulai</th>
              <th>Sumber</th>
              <th>Status</th>
              <th>Rentang</th>
              <th>Hasil</th>
            </tr>
          </thead>
          <tbody>
            <template
              v-for="r in runs?.runs ?? []"
              :key="r.id"
            >
              <tr>
                <td class="nowrap">
                  {{ formatTime(r.startedAt) }}
                  <div class="muted rv-small">
                    {{ r.trigger === 'schedule' ? 'jadwal' : r.trigger === 'cli' ? 'CLI' : 'manual' }}{{ r.mock ? ', mock' : '' }}
                  </div>
                </td>
                <td>{{ r.sourceName }}</td>
                <td>
                  <span :class="['rv-status', `rv-status--${runTone(r.status)}`]">{{ RUN_TEXT[r.status] ?? r.status }}</span>
                </td>
                <td class="nowrap rv-small">
                  {{ formatRange(r.rangeStart, r.rangeEnd) }}
                </td>
                <td class="rv-small">
                  {{ r.rowsFetched }} baris: {{ r.inserted }} baru, {{ r.updated }} diperbarui, {{ r.unchanged }} sama<template v-if="r.failed">
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
                <td colspan="5">
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
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
