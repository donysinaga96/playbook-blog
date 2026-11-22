<!--
  Pengaturan site: nama, tagline, logo, favicon, dan SEO bawaan. Permalink
  hanya ditampilkan: mengubahnya mengganti URL semua artikel. Simpan membawa
  updatedAt yang dibaca saat halaman dibuka (409 bila diubah di tempat lain).
-->
<script setup lang="ts">
import type { SiteSettingsRecord } from '@framework/core'

definePageMeta({ layout: 'admin' })

const site = useAdminSite()
const me = useAdminMe()

const { data, error, refresh } = await useAsyncData(
  () => `settings-${site.value?.id}`,
  () => (site.value ? adminApi<Json<SiteSettingsRecord>>(site.value.id, 'settings') : Promise.resolve(null)),
  { server: false },
)

const form = reactive({
  name: '', tagline: '', logoMediaId: null as string | null, faviconMediaId: null as string | null,
  titleTemplate: '', defaultDescription: '', defaultOgImageId: null as string | null,
})
watch(data, (d) => {
  if (!d) return
  Object.assign(form, {
    name: d.name, tagline: d.tagline ?? '', logoMediaId: d.logoMediaId, faviconMediaId: d.faviconMediaId,
    titleTemplate: d.seo.titleTemplate ?? '', defaultDescription: d.seo.defaultDescription ?? '', defaultOgImageId: d.seo.defaultOgImageId,
  })
}, { immediate: true })

const errors = ref<Record<string, string>>({})
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const busy = ref(false)
const err = (field: string) => fieldError(errors.value, field)

async function save() {
  if (!site.value || !data.value) return
  busy.value = true
  errors.value = {}
  message.value = null
  try {
    const saved = await adminApi<Json<SiteSettingsRecord>>(site.value.id, 'settings', {
      method: 'PUT',
      body: {
        settings: {
          name: form.name, tagline: form.tagline || null, logoMediaId: form.logoMediaId, faviconMediaId: form.faviconMediaId,
          seo: { titleTemplate: form.titleTemplate || null, defaultDescription: form.defaultDescription || null, defaultOgImageId: form.defaultOgImageId },
        },
        updatedAt: data.value.updatedAt,
      },
    })
    data.value = saved
    // Nama di pemilih site ikut berubah tanpa memuat ulang.
    const entry = me.value?.sites.find((s) => s.id === site.value?.id)
    if (entry) entry.name = saved.name
    message.value = { kind: 'ok', text: 'Pengaturan site disimpan.' }
  } catch (e) {
    errors.value = apiFieldErrors(e)
    message.value = { kind: 'error', text: apiStatus(e) === 409 ? 'Pengaturan sudah diubah di tempat lain. Muat ulang lalu simpan lagi.' : apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <header class="adm-head">
      <h1>Pengaturan site</h1>
      <div class="adm-head__actions">
        <button
          type="button"
          class="btn btn--primary"
          :disabled="busy || !data"
          @click="save"
        >
          {{ busy ? 'Menyimpan…' : 'Simpan' }}
        </button>
      </div>
    </header>

    <p
      v-if="error"
      class="notice notice--error"
    >
      {{ apiErrorMessage(error) }}
    </p>
    <div
      v-if="message"
      class="notice"
      :class="{ 'notice--error': message.kind === 'error' }"
      role="status"
    >
      {{ message.text }}
      <button
        v-if="message.kind === 'error'"
        type="button"
        class="btn btn--small"
        @click="refresh()"
      >
        Muat ulang
      </button>
    </div>

    <div
      v-if="data && site"
      class="adm-editor"
    >
      <div class="stack">
        <section class="adm-panel stack">
          <h2>Identitas</h2>
          <label class="field">
            <span>Nama site</span>
            <input
              v-model="form.name"
              type="text"
              maxlength="120"
              :aria-invalid="!!err('name') || undefined"
            >
            <span
              v-if="err('name')"
              class="field__error"
            >{{ err('name') }}</span>
          </label>
          <label class="field">
            <span>Tagline</span>
            <input
              v-model="form.tagline"
              type="text"
              maxlength="160"
            >
            <span class="field__hint">Tampil di samping nama site di kepala halaman.</span>
          </label>
        </section>

        <section class="adm-panel stack">
          <h2>SEO bawaan</h2>
          <label class="field">
            <span>Pola judul halaman</span>
            <input
              v-model="form.titleTemplate"
              type="text"
              maxlength="120"
              :placeholder="`%s | ${form.name}`"
              :aria-invalid="!!err('seo.titleTemplate') || undefined"
            >
            <span class="field__hint">%s diganti judul artikel atau halaman. Kosong: "%s | nama site".</span>
            <span
              v-if="err('seo.titleTemplate')"
              class="field__error"
            >{{ err('seo.titleTemplate') }}</span>
          </label>
          <label class="field">
            <span>Deskripsi bawaan</span>
            <textarea
              v-model="form.defaultDescription"
              rows="3"
              maxlength="320"
            />
            <span class="field__hint">Dipakai mesin pencari dan media sosial bila halaman tidak punya ringkasan.</span>
          </label>
          <div class="field">
            <span>Gambar bagikan bawaan</span>
            <AdminMediaPicker
              v-model="form.defaultOgImageId"
              :site-id="site.id"
              label="Gambar bagikan"
              :invalid="!!err('seo.defaultOgImageId')"
            />
          </div>
        </section>
      </div>

      <aside class="stack">
        <section class="adm-panel stack">
          <h2>Logo</h2>
          <AdminMediaPicker
            v-model="form.logoMediaId"
            :site-id="site.id"
            label="Logo"
            :invalid="!!err('logoMediaId')"
          />
          <span
            v-if="err('logoMediaId')"
            class="field__error"
          >{{ err('logoMediaId') }}</span>
          <span class="field__hint">Kosong: nama site tampil sebagai teks.</span>
        </section>
        <section class="adm-panel stack">
          <h2>Favicon</h2>
          <AdminMediaPicker
            v-model="form.faviconMediaId"
            :site-id="site.id"
            label="Favicon"
            :invalid="!!err('faviconMediaId')"
          />
          <span
            v-if="err('faviconMediaId')"
            class="field__error"
          >{{ err('faviconMediaId') }}</span>
          <span class="field__hint">Ikon kecil di tab browser; gambar persegi.</span>
        </section>
        <section class="adm-panel">
          <h2>Pola URL artikel</h2>
          <p class="mono">
            {{ data.permalink }}
          </p>
          <p class="field__hint">
            Tidak bisa diubah di sini: mengubahnya mengganti alamat semua artikel.
          </p>
        </section>
      </aside>
    </div>
  </div>
</template>
