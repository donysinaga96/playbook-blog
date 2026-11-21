<!--
  Pengaturan tema (M4 4.4). Kiri: template, token, opsi, dan susunan beranda,
  semuanya dari skema manifest. Kanan: pratinjau langsung (usulan M4-D):
  draf dikirim ke sesi admin, iframe merender halaman site dengan draf itu
  tanpa mengubah theme aktif. Simpan = validasi ketat lalu aktifkan.
-->
<script setup lang="ts">
definePageMeta({ layout: 'admin' })

interface Item { type: string; props: Record<string, unknown> }
interface TemplateInfo {
  key: string
  name: string
  version: string
  tokens: { schema: Record<string, unknown>; defaults: Record<string, unknown> }
  options: { schema: Record<string, unknown>; defaults: Record<string, unknown> }
  sections: { type: string; title: string; schema: Record<string, unknown> }[]
  defaultLayouts: { home: Item[] }
  stored: { templateVersion: string; isActive: boolean; updatedAt: string } | null
  config: { tokens: Record<string, unknown>; options: Record<string, unknown>; layouts: { home?: Item[] } }
  issues: string[]
}
interface Draft { tokens: Record<string, unknown>; options: Record<string, unknown>; home: Item[] | undefined }

const site = useAdminSite()
const { data, error, refresh } = await useAsyncData(
  () => `theme-${site.value?.id}`,
  () => (site.value ? adminApi<{ activeKey: string; limits: { maxSectionsPerPage: number }; templates: TemplateInfo[] }>(site.value.id, 'theme') : Promise.resolve(null)),
  { server: false },
)

const selectedKey = ref('')
/** Draf per template: berpindah template tidak membuang perubahan. */
const drafts = reactive<Record<string, Draft>>({})
const errors = ref<Record<string, string>>({})
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const busy = ref(false)

const fromConfig = (t: TemplateInfo): Draft => ({ tokens: structuredClone(t.config.tokens), options: structuredClone(t.config.options), home: t.config.layouts.home ? structuredClone(t.config.layouts.home) : undefined })

/** Draf template yang belum ada diisi dari config tersimpan; draf yang sedang diedit dibiarkan. */
function syncDrafts() {
  for (const t of data.value?.templates ?? []) drafts[t.key] ??= fromConfig(t)
  selectedKey.value ||= data.value?.activeKey ?? ''
}
watch(data, syncDrafts, { immediate: true })

const template = computed(() => data.value?.templates.find((t) => t.key === selectedKey.value) ?? null)
const draft = computed(() => drafts[selectedKey.value])
const isActive = computed(() => selectedKey.value === data.value?.activeKey)
const payloadDraft = () => (draft.value ? { tokens: draft.value.tokens, options: draft.value.options, layouts: draft.value.home === undefined ? {} : { home: draft.value.home } } : null)

/** JSON dengan key terurut: dua object sama walau urutan key berbeda. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : v)
}

// ---------- Pratinjau ----------
const previewPath = ref('/')
/** Id draf pratinjau milik tab ini (server menyimpannya per id, bukan per sesi). */
const draftId = ref<string | null>(null)
const previewWidth = ref<'desktop' | 'mobile'>('desktop')
const previewSrc = ref('')
const previewError = ref<string | null>(null)
const previewBusy = ref(false)

async function updatePreview() {
  if (!site.value || !draft.value) return
  previewBusy.value = true
  try {
    const result = await adminApi<{ draftId: string; base: string }>(site.value.id, 'theme/preview', { method: 'POST', body: { templateKey: selectedKey.value, draft: payloadDraft(), draftId: draftId.value ?? undefined } })
    draftId.value = result.draftId
    previewError.value = null
    errors.value = {}
    const path = previewPath.value.startsWith('/') ? previewPath.value : `/${previewPath.value}`
    previewSrc.value = `${result.base}${path}${path.includes('?') ? '&' : '?'}draft=${result.draftId}&v=${Date.now()}`
  } catch (e) {
    errors.value = apiFieldErrors(e)
    previewError.value = apiStatus(e) === 422 ? 'Pratinjau ditunda: ada isian yang belum valid.' : apiErrorMessage(e)
  } finally {
    previewBusy.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch([() => JSON.stringify(draft.value), selectedKey, previewPath], () => {
  clearTimeout(timer)
  timer = setTimeout(updatePreview, 600)
})
onMounted(() => {
  if (draft.value) void updatePreview()
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  // Draf pratinjau tidak perlu bertahan setelah halaman ditinggalkan.
  if (site.value && draftId.value) void adminApi(site.value.id, 'theme/preview', { method: 'DELETE', query: { draftId: draftId.value } }).catch(() => {})
})

// ---------- Simpan ----------
async function save() {
  if (!site.value || !template.value) return
  if (!isActive.value && !confirm(`Ganti tampilan site ke template ${template.value.name}? Perubahan langsung terlihat pengunjung.`)) return
  busy.value = true
  errors.value = {}
  message.value = null
  try {
    await adminApi(site.value.id, 'theme', { method: 'PUT', body: { templateKey: selectedKey.value, draft: payloadDraft(), updatedAt: template.value.stored?.updatedAt ?? null } })
    await refresh()
    // Hanya draf template yang disimpan yang diselaraskan; draf template lain tetap.
    const saved = data.value?.templates.find((t) => t.key === selectedKey.value)
    if (saved) drafts[saved.key] = fromConfig(saved)
    message.value = { kind: 'ok', text: `Tema ${template.value.name} disimpan dan aktif di site.` }
  } catch (e) {
    errors.value = apiFieldErrors(e)
    message.value = { kind: 'error', text: apiStatus(e) === 409 ? 'Tema sudah diubah di tempat lain. Muat ulang halaman ini.' : apiStatus(e) === 422 ? 'Periksa kembali isian yang ditandai.' : apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}

function resetSelected() {
  const t = template.value
  if (!t) return
  drafts[t.key] = { tokens: structuredClone(t.tokens.defaults), options: structuredClone(t.options.defaults), home: undefined }
}

const dirty = computed(() => {
  const t = template.value
  if (!t || !draft.value) return false
  return stable({ tokens: draft.value.tokens, options: draft.value.options, home: draft.value.home }) !== stable({ tokens: t.config.tokens, options: t.config.options, home: t.config.layouts.home })
})
</script>

<template>
  <div v-if="site">
    <header class="adm-head">
      <h1>Tema</h1>
      <span
        v-if="dirty"
        class="muted"
      >Belum disimpan</span>
      <div class="adm-head__actions">
        <button
          type="button"
          class="btn"
          :disabled="busy"
          @click="resetSelected"
        >
          Kembalikan bawaan
        </button>
        <button
          type="button"
          class="btn btn--primary"
          :disabled="busy || !template"
          @click="save"
        >
          {{ isActive ? 'Simpan' : 'Simpan dan aktifkan' }}
        </button>
      </div>
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

    <div
      v-if="template && draft"
      class="adm-theme"
    >
      <div class="adm-theme__form">
        <section class="adm-panel">
          <h2>Template</h2>
          <label class="field">
            <span>Tampilan site</span>
            <select v-model="selectedKey">
              <option
                v-for="t in data?.templates ?? []"
                :key="t.key"
                :value="t.key"
              >
                {{ t.name }} {{ t.version }}{{ t.key === data?.activeKey ? ' (aktif)' : '' }}
              </option>
            </select>
            <span class="field__hint">
              {{ isActive ? 'Template yang sedang tampil di site.' : 'Belum aktif: lihat pratinjau, lalu simpan untuk mengaktifkan.' }}
              <template v-if="template.stored && template.stored.templateVersion !== template.version">
                Config tersimpan untuk versi {{ template.stored.templateVersion }}; disimpan ulang sebagai {{ template.version }}.
              </template>
            </span>
          </label>
          <p
            v-if="template.issues.length"
            class="field__error"
          >
            Config tersimpan punya nilai yang tidak dikenal; nilai itu diganti bawaan: {{ template.issues.join('; ') }}
          </p>
        </section>

        <section class="adm-panel">
          <h2>Warna, huruf, dan bentuk</h2>
          <AdminSchemaForm
            v-model="draft.tokens"
            :schema="template.tokens.schema"
            path="tokens"
            :errors="errors"
          />
        </section>

        <section class="adm-panel">
          <h2>Opsi tampilan</h2>
          <AdminSchemaForm
            v-model="draft.options"
            :schema="template.options.schema"
            path="options"
            :errors="errors"
          />
        </section>

        <section class="adm-panel">
          <h2>Susunan beranda</h2>
          <AdminLayoutEditor
            v-model="draft.home"
            :sections="template.sections"
            :defaults="template.defaultLayouts.home"
            :max-sections="data?.limits.maxSectionsPerPage ?? 8"
            :errors="errors"
          />
          <p
            v-if="fieldError(errors, 'layouts')"
            class="field__error"
          >
            {{ fieldError(errors, 'layouts') }}
          </p>
        </section>
      </div>

      <aside class="adm-theme__preview">
        <div class="adm-preview-bar">
          <select
            v-model="previewPath"
            aria-label="Halaman yang dipratinjau"
          >
            <option value="/">
              Beranda
            </option>
            <option value="/?page=2">
              Arsip terbaru
            </option>
            <option value="/search?q=a">
              Pencarian
            </option>
            <option value="/tidak-ada">
              Halaman 404
            </option>
          </select>
          <div
            class="adm-segmented"
            role="radiogroup"
            aria-label="Lebar pratinjau"
          >
            <label :class="{ 'is-on': previewWidth === 'desktop' }"><input
              v-model="previewWidth"
              type="radio"
              value="desktop"
            >Desktop</label>
            <label :class="{ 'is-on': previewWidth === 'mobile' }"><input
              v-model="previewWidth"
              type="radio"
              value="mobile"
            >Ponsel</label>
          </div>
          <span
            class="muted"
            aria-live="polite"
          >{{ previewBusy ? 'Memperbarui…' : 'Pratinjau, belum tampil di site' }}</span>
        </div>
        <p
          v-if="previewError"
          class="field__error"
        >
          {{ previewError }}
        </p>
        <div
          class="adm-preview-frame"
          :class="`is-${previewWidth}`"
        >
          <iframe
            v-if="previewSrc"
            :src="previewSrc"
            title="Pratinjau tema"
          />
        </div>
      </aside>
    </div>
  </div>
</template>
