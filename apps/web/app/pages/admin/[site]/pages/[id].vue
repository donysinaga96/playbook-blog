<!-- Editor halaman statis (M4 4.2). /admin/:site/pages/new = halaman baru. -->
<script setup lang="ts">
import type { Block, PageRecord } from '@framework/core'

definePageMeta({ layout: 'admin' })

const site = useAdminSite()
const route = useRoute()
const isNew = computed(() => route.params['id'] === 'new')

const form = reactive({
  title: '', slug: '', viewKey: 'default', status: 'DRAFT', publishedLocal: '',
  blocks: [{ type: 'paragraph', text: '' }] as Block[],
  seo: { title: '', description: '' },
})
const record = ref<Json<PageRecord> | null>(null)
const errors = ref<Record<string, string>>({})
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const conflict = ref(false)
const busy = ref(false)
const saved = ref('')
const loadedPublished = ref('')
const snapshot = () => JSON.stringify(form)
const dirty = computed(() => snapshot() !== saved.value)

function fill(p: Json<PageRecord>) {
  record.value = p
  Object.assign(form, {
    title: p.title, slug: p.slug, viewKey: p.viewKey, status: p.status,
    publishedLocal: isoToZonedInput(p.publishedAt, site.value?.timezone ?? 'UTC'),
    blocks: structuredClone(p.body.blocks), seo: { title: p.seo.title ?? '', description: p.seo.description ?? '' },
  })
  loadedPublished.value = form.publishedLocal
  saved.value = snapshot()
}

async function load() {
  conflict.value = false
  errors.value = {}
  if (isNew.value || !site.value) {
    saved.value = snapshot()
    return
  }
  try {
    const all = await adminApi<Json<PageRecord>[]>(site.value.id, 'pages')
    const found = all.find((p) => p.id === route.params['id'])
    if (found) fill(found)
    else message.value = { kind: 'error', text: 'Halaman tidak ditemukan' }
  } catch (e) {
    message.value = { kind: 'error', text: apiErrorMessage(e) }
  }
}
onMounted(load)

async function save() {
  if (!site.value) return
  busy.value = true
  errors.value = {}
  message.value = null
  const page = {
    title: form.title, slug: form.slug.trim() || undefined, viewKey: form.viewKey || 'default', status: form.status,
    // Tanggal tidak diubah = tidak dikirim (detik tersimpan tetap utuh).
    publishedAt: form.publishedLocal === loadedPublished.value ? undefined : form.publishedLocal ? zonedInputToIso(form.publishedLocal, site.value.timezone) : null,
    body: { version: 2 /* BODY_VERSION */, blocks: cleanBlocks(form.blocks) }, seo: mergeSeo(record.value?.seo ?? {}, form.seo),
  }
  try {
    if (isNew.value) {
      const created = await adminApi<Json<PageRecord>>(site.value.id, 'pages', { method: 'POST', body: page })
      fill(created)
      await navigateTo(`/admin/${site.value.code}/pages/${created.id}`, { replace: true })
      message.value = { kind: 'ok', text: 'Halaman dibuat.' }
    } else if (record.value) {
      fill(await adminApi<Json<PageRecord>>(site.value.id, `pages/${record.value.id}`, { method: 'PUT', body: { page, updatedAt: record.value.updatedAt } }))
      message.value = { kind: 'ok', text: 'Disimpan.' }
    }
  } catch (e) {
    if (apiStatus(e) === 409) conflict.value = true
    errors.value = apiFieldErrors(e)
    message.value = { kind: 'error', text: apiStatus(e) === 422 ? 'Periksa kembali isian yang ditandai.' : apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}

const err = (field: string) => fieldError(errors.value, field)
onBeforeRouteLeave(() => {
  if (dirty.value && !confirm('Ada perubahan yang belum disimpan. Tinggalkan halaman?')) return false
})
</script>

<template>
  <form
    v-if="site"
    @submit.prevent="save"
  >
    <header class="adm-head">
      <NuxtLink :to="`/admin/${site.code}/pages`">
        Halaman
      </NuxtLink>
      <span class="muted">/</span>
      <h1>{{ isNew ? 'Halaman baru' : form.title || 'Tanpa judul' }}</h1>
      <div class="adm-head__actions">
        <span
          v-if="dirty"
          class="muted"
        >Belum disimpan</span>
        <button
          type="submit"
          class="btn btn--primary"
          :disabled="busy"
        >
          {{ busy ? 'Menyimpan…' : 'Simpan' }}
        </button>
      </div>
    </header>
    <p
      v-if="conflict"
      class="notice notice--error"
      role="alert"
    >
      Halaman ini sudah diubah di tempat lain.
      <button
        type="button"
        class="btn btn--small"
        @click="load"
      >
        Muat versi terbaru
      </button>
    </p>
    <p
      v-else-if="message"
      class="notice"
      :class="{ 'notice--error': message.kind === 'error' }"
      role="status"
    >
      {{ message.text }}
    </p>

    <div class="adm-editor">
      <div>
        <input
          v-model="form.title"
          class="adm-editor__title"
          type="text"
          placeholder="Judul halaman"
          aria-label="Judul"
          :aria-invalid="!!err('title') || undefined"
        >
        <p
          v-if="err('title')"
          class="field__error"
        >
          {{ err('title') }}
        </p>
        <AdminBlockEditor
          v-model="form.blocks"
          :site-id="site.id"
          :errors="errors"
        />
      </div>
      <aside>
        <section class="adm-panel">
          <h2>Terbit</h2>
          <label class="field">
            <span>Status</span>
            <select v-model="form.status">
              <option value="DRAFT">Draf</option>
              <option value="PUBLISHED">Terbit</option>
              <option value="ARCHIVED">Arsip</option>
            </select>
          </label>
          <label class="field">
            <span>Tanggal terbit ({{ zoneLabel(site.timezone) }})</span>
            <input
              v-model="form.publishedLocal"
              type="datetime-local"
            >
          </label>
          <label class="field">
            <span>Slug</span>
            <input
              v-model="form.slug"
              type="text"
              class="mono"
              :placeholder="isNew ? 'dibuat dari judul' : ''"
              :aria-invalid="!!err('slug') || undefined"
            >
            <span
              v-if="err('slug')"
              class="field__error"
            >{{ err('slug') }}</span>
            <span
              v-else
              class="field__hint mono"
            >/p/{{ form.slug || '…' }}</span>
          </label>
          <label class="field">
            <span>Tampilan</span>
            <input
              v-model="form.viewKey"
              type="text"
              class="mono"
              :aria-invalid="!!err('viewKey') || undefined"
            >
            <span class="field__hint">default, atau varian yang disediakan template (mis. contact).</span>
          </label>
        </section>
        <section class="adm-panel">
          <h2>SEO</h2>
          <label class="field">
            <span>Judul di mesin pencari</span>
            <input
              v-model="form.seo.title"
              type="text"
              :placeholder="form.title"
            >
          </label>
          <label class="field">
            <span>Deskripsi</span>
            <textarea
              v-model="form.seo.description"
              rows="3"
            />
          </label>
        </section>
      </aside>
    </div>
  </form>
</template>
