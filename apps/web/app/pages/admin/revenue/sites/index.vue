<!--
  Kelola situs penghasil pendapatan (ADR-011), termasuk situs yang tidak
  dilayani framework ini. Domain dipakai untuk memetakan laporan iklan
  (Adsterra/AdSense per domain) dan kolom domain di file impor; entri lama
  berdomain sama otomatis terhubung saat situs dibuat atau domainnya diubah.
-->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface Data { properties: PropertyInfo[]; sites: { id: string; code: string; name: string }[] }
const { data, refresh } = await useAsyncData('revenue-properties', () => revenueApi<Data>('properties'), { server: false })

const empty = () => ({ id: '', code: '', name: '', domain: '', siteId: '', status: 'ACTIVE' as 'ACTIVE' | 'ARCHIVED', updatedAt: '' })
const form = reactive(empty())
const errors = ref<Record<string, string>>({})
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const busy = ref(false)

function edit(p: PropertyInfo) {
  Object.assign(form, { id: p.id, code: p.code, name: p.name, domain: p.domain ?? '', siteId: p.siteId ?? '', status: p.status, updatedAt: p.updatedAt })
  message.value = null
}

async function save() {
  busy.value = true
  errors.value = {}
  message.value = null
  const body = { code: form.code, name: form.name, domain: form.domain || null, siteId: form.siteId || null, status: form.status }
  try {
    const r = form.id
      ? await revenueApi<{ linkedEntries: number }>(`properties/${form.id}`, { method: 'PUT', body: { ...body, updatedAt: form.updatedAt } })
      : await revenueApi<{ linkedEntries: number }>('properties', { method: 'POST', body })
    message.value = { kind: 'ok', text: `Situs disimpan.${r.linkedEntries ? ` ${r.linkedEntries} entri lama berdomain sama kini terhubung.` : ''}` }
    Object.assign(form, empty())
    await Promise.all([refresh(), refreshRevenueNav()])
  } catch (e) {
    errors.value = apiFieldErrors(e)
    message.value = { kind: 'error', text: apiStatus(e) === 409 ? 'Situs ini sudah diubah di tempat lain. Muat ulang.' : apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}
const err = (f: string) => fieldError(errors.value, f)

function suggestCode() {
  if (!form.id && !form.code && form.name) form.code = form.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
}

useHead({ title: 'Kelola situs · Pendapatan' })
</script>

<template>
  <div>
    <header class="adm-head">
      <h1>Situs</h1>
    </header>
    <div class="adm-split">
      <section>
        <table class="table">
          <thead>
            <tr>
              <th>Situs</th>
              <th>Domain</th>
              <th>Site framework</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in data?.properties ?? []"
              :key="p.id"
              :class="{ 'is-selected': form.id === p.id }"
            >
              <td>
                <NuxtLink :to="`/admin/revenue/sites/${p.code}`">
                  {{ p.name }}
                </NuxtLink>
                <span
                  v-if="p.status === 'ARCHIVED'"
                  class="muted"
                > (diarsipkan)</span>
              </td>
              <td class="mono">
                {{ p.domain ?? '-' }}
              </td>
              <td>{{ p.siteCode ?? 'di luar framework' }}</td>
              <td>
                <button
                  type="button"
                  class="btn btn--small"
                  @click="edit(p)"
                >
                  Ubah
                </button>
              </td>
            </tr>
            <tr v-if="data && !data.properties.length">
              <td
                colspan="4"
                class="muted"
              >
                Belum ada situs. Tambahkan situs agar pendapatan bisa dilihat per web.
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <section class="adm-panel">
        <h2>{{ form.id ? 'Ubah situs' : 'Tambah situs' }}</h2>
        <form
          class="stack"
          @submit.prevent="save"
        >
          <label class="field">
            <span>Nama</span>
            <input
              v-model="form.name"
              type="text"
              required
              maxlength="120"
              :aria-invalid="Boolean(err('name'))"
              @blur="suggestCode"
            >
          </label>
          <label class="field">
            <span>Kode</span>
            <input
              v-model="form.code"
              type="text"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              :aria-invalid="Boolean(err('code'))"
            >
            <span class="field__hint">Dipakai di URL, mis. /admin/revenue/sites/{{ form.code || 'kode' }}</span>
            <span
              v-if="err('code')"
              class="field__error"
            >{{ err('code') }}</span>
          </label>
          <label class="field">
            <span>Domain</span>
            <input
              v-model="form.domain"
              type="text"
              placeholder="contoh.com"
              :aria-invalid="Boolean(err('domain'))"
            >
            <span class="field__hint">Sama dengan nama domain di laporan Adsterra/AdSense (www. diabaikan).</span>
            <span
              v-if="err('domain')"
              class="field__error"
            >{{ err('domain') }}</span>
          </label>
          <label class="field">
            <span>Site di framework ini</span>
            <select v-model="form.siteId">
              <option value="">Tidak ada (situs luar)</option>
              <option
                v-for="s in data?.sites ?? []"
                :key="s.id"
                :value="s.id"
              >{{ s.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Status</span>
            <select v-model="form.status">
              <option value="ACTIVE">Aktif</option>
              <option value="ARCHIVED">Diarsipkan (tidak tampil di menu)</option>
            </select>
          </label>
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
              {{ form.id ? 'Simpan perubahan' : 'Tambah situs' }}
            </button>
            <button
              v-if="form.id"
              type="button"
              class="btn btn--ghost"
              @click="Object.assign(form, empty())"
            >
              Batal
            </button>
          </div>
        </form>
      </section>
    </div>
  </div>
</template>
