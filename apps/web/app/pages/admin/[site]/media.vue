<!--
  Media site (M4 4.3): unggah, galeri, ubah keterangan dan titik fokus
  (klik di gambar), hapus bila tidak dipakai di mana pun.
-->
<script setup lang="ts">
import type { MediaListItem, Page } from '@framework/core'

definePageMeta({ layout: 'admin' })

const site = useAdminSite()
const items = ref<Json<MediaListItem>[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref<string | null>(null)

async function loadPage(n: number) {
  if (!site.value) return
  loading.value = true
  try {
    const result = await adminApi<Json<Page<MediaListItem>>>(site.value.id, 'media', { query: { page: n } })
    items.value = n === 1 ? result.items : appendUnique(items.value, result.items)
    total.value = result.total
  } catch (e) {
    loadError.value = apiErrorMessage(e)
  } finally {
    loading.value = false
  }
}
onMounted(() => loadPage(1))
watch(site, () => {
  selected.value = null
  void loadPage(1)
})

const selected = ref<Json<MediaListItem> | null>(null)
const form = reactive({ altText: '', caption: '', credit: '', sourceUrl: '', focalX: 0.5, focalY: 0.5 })
const usage = ref<string[] | null>(null)
const errors = ref<Record<string, string>>({})
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const busy = ref(false)

async function edit(m: Json<MediaListItem>) {
  selected.value = m
  errors.value = {}
  message.value = null
  Object.assign(form, { altText: m.altText ?? '', caption: m.caption ?? '', credit: m.credit ?? '', sourceUrl: m.sourceUrl ?? '', focalX: m.focalX, focalY: m.focalY })
  usage.value = null
  if (site.value) usage.value = await adminApi<string[]>(site.value.id, `media/${m.id}/usage`).catch(() => null)
}

function setFocal(event: MouseEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const clamp = (v: number) => Math.round(Math.min(Math.max(v, 0), 1) * 1000) / 1000
  form.focalX = clamp((event.clientX - box.left) / box.width)
  form.focalY = clamp((event.clientY - box.top) / box.height)
}

/** Panah menggeser titik fokus 5% (agar bisa tanpa mouse). */
function nudgeFocal(event: KeyboardEvent) {
  const step = 0.05
  const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  const move = delta[event.key]
  if (!move) return
  event.preventDefault()
  const clamp = (v: number) => Math.round(Math.min(Math.max(v, 0), 1) * 1000) / 1000
  form.focalX = clamp(form.focalX + move[0])
  form.focalY = clamp(form.focalY + move[1])
}

function replace(updated: Json<MediaListItem>) {
  items.value = items.value.map((m) => (m.id === updated.id ? updated : m))
  selected.value = updated
}

async function save() {
  if (!site.value || !selected.value) return
  busy.value = true
  errors.value = {}
  message.value = null
  try {
    replace(await adminApi<Json<MediaListItem>>(site.value.id, `media/${selected.value.id}`, {
      method: 'PUT',
      body: { media: { altText: form.altText, caption: form.caption || null, credit: form.credit || null, sourceUrl: form.sourceUrl.trim() || null, focalX: form.focalX, focalY: form.focalY }, updatedAt: selected.value.updatedAt },
    }))
    message.value = { kind: 'ok', text: 'Keterangan media disimpan.' }
  } catch (e) {
    errors.value = apiFieldErrors(e)
    message.value = { kind: 'error', text: apiStatus(e) === 409 ? 'Media sudah diubah di tempat lain; pilih lagi dari galeri.' : apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!site.value || !selected.value) return
  if (!confirm('Hapus gambar ini beserta file-nya? Tindakan ini tidak bisa dibatalkan.')) return
  busy.value = true
  try {
    await adminApi(site.value.id, `media/${selected.value.id}`, { method: 'DELETE', query: { updatedAt: selected.value.updatedAt } })
    items.value = items.value.filter((m) => m.id !== selected.value?.id)
    total.value--
    selected.value = null
    message.value = { kind: 'ok', text: 'Gambar dihapus.' }
  } catch (e) {
    message.value = { kind: 'error', text: apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}

function uploaded(m: Json<MediaListItem>) {
  items.value = [m, ...items.value]
  total.value++
  void edit(m)
  message.value = { kind: 'ok', text: 'Gambar diunggah.' }
}

const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`)
const err = (field: string) => fieldError(errors.value, field)
</script>

<template>
  <div v-if="site">
    <header class="adm-head">
      <h1>Media</h1>
      <span class="muted">{{ total }} gambar</span>
    </header>
    <p
      v-if="loadError"
      class="notice notice--error"
    >
      {{ loadError }}
    </p>
    <p
      v-if="message"
      class="notice"
      :class="{ 'notice--error': message.kind === 'error' }"
      role="status"
    >
      {{ message.text }}
    </p>

    <div class="adm-split">
      <div>
        <details class="adm-dialog__upload">
          <summary>Unggah gambar</summary>
          <AdminMediaUploadForm
            :site-id="site.id"
            @uploaded="uploaded"
          />
        </details>
        <div class="adm-gallery">
          <button
            v-for="m in items"
            :key="m.id"
            type="button"
            class="adm-gallery__item"
            :class="{ 'is-selected': m.id === selected?.id }"
            :aria-pressed="m.id === selected?.id"
            @click="edit(m)"
          >
            <img
              :src="mediaFileUrl(site.id, m.id)"
              :alt="m.altText ?? ''"
              loading="lazy"
            >
            <span>{{ m.altText || mediaName(m) }}</span>
          </button>
        </div>
        <p
          v-if="!loading && items.length === 0"
          class="muted"
        >
          Belum ada media. Unggah gambar pertama.
        </p>
        <button
          v-if="items.length < total"
          type="button"
          class="btn btn--small"
          :disabled="loading"
          @click="loadPage(nextMediaPage(items.length))"
        >
          Muat lagi
        </button>
      </div>

      <form
        v-if="selected"
        class="adm-panel"
        @submit.prevent="save"
      >
        <h2>{{ mediaName(selected) }}</h2>
        <div
          class="adm-focal"
          role="button"
          tabindex="0"
          :aria-label="`Titik fokus ${Math.round(form.focalX * 100)}% dari kiri, ${Math.round(form.focalY * 100)}% dari atas. Klik gambar atau pakai tombol panah.`"
          @click="setFocal"
          @keydown="nudgeFocal"
        >
          <img
            :src="mediaFileUrl(site.id, selected.id)"
            :alt="selected.altText ?? ''"
          >
          <span
            class="adm-focal__dot"
            :style="{ left: `${form.focalX * 100}%`, top: `${form.focalY * 100}%` }"
          />
        </div>
        <p class="field__hint">
          Klik bagian terpenting gambar. Saat gambar dipotong untuk kartu atau layar kecil, titik ini tetap terlihat.
        </p>
        <p class="muted">
          {{ selected.mimeType }}, {{ selected.width }}×{{ selected.height }}, {{ sizeLabel(selected.sizeBytes) }}
        </p>
        <label class="field">
          <span>Teks alternatif</span>
          <input
            v-model="form.altText"
            type="text"
            :aria-invalid="!!err('altText') || undefined"
          >
          <span
            v-if="err('altText')"
            class="field__error"
          >{{ err('altText') }}</span>
        </label>
        <label class="field">
          <span>Keterangan</span>
          <input
            v-model="form.caption"
            type="text"
          >
        </label>
        <label class="field">
          <span>Kredit</span>
          <input
            v-model="form.credit"
            type="text"
          >
        </label>
        <label class="field">
          <span>URL sumber</span>
          <input
            v-model="form.sourceUrl"
            type="url"
            placeholder="https://… (halaman asal gambar)"
            :aria-invalid="!!err('sourceUrl') || undefined"
          >
          <span
            v-if="err('sourceUrl')"
            class="field__error"
          >{{ err('sourceUrl') }}</span>
        </label>
        <div class="field">
          <span>Dipakai di</span>
          <span
            v-if="usage === null"
            class="muted"
          >Memeriksa…</span>
          <span
            v-else-if="usage.length === 0"
            class="muted"
          >Belum dipakai; boleh dihapus.</span>
          <ul
            v-else
            style="margin: 0; padding-left: 1.25rem"
          >
            <li
              v-for="u in usage"
              :key="u"
            >
              {{ u }}
            </li>
          </ul>
        </div>
        <div class="adm-head__actions">
          <button
            type="button"
            class="btn btn--danger"
            :disabled="busy || !usage || usage.length > 0"
            :title="usage?.length ? 'Lepas dulu dari konten yang memakainya' : undefined"
            @click="remove"
          >
            Hapus
          </button>
          <button
            type="submit"
            class="btn btn--primary"
            :disabled="busy"
          >
            Simpan
          </button>
        </div>
      </form>
      <p
        v-else
        class="muted"
      >
        Pilih gambar di galeri untuk mengubah teks alternatif, keterangan, dan titik fokus.
      </p>
    </div>
  </div>
</template>
