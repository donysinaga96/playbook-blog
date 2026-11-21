<!--
  Pemilih gambar (M4 4.3) untuk gambar utama, gambar OG, dan block gambar:
  pratinjau pilihan saat ini, lalu dialog berisi galeri media site dan form
  unggah. Gambar yang baru diunggah langsung terpilih.
-->
<script setup lang="ts">
import type { MediaListItem, Page } from '@framework/core'

const props = withDefaults(defineProps<{ siteId: string; invalid?: boolean; allowEmpty?: boolean; label?: string }>(), {
  invalid: false, allowEmpty: true, label: 'Gambar',
})
const model = defineModel<string | null>({ required: true })

const dialog = ref<HTMLDialogElement | null>(null)
const items = ref<Json<MediaListItem>[]>([])
const total = ref(0)
const loading = ref(false)

/** Media terpilih (bisa di luar halaman galeri yang sudah dimuat). */
const { data: current, refresh: refreshCurrent } = useAsyncData(
  () => `media-one-${props.siteId}-${model.value ?? ''}`,
  async () => (model.value ? (await adminApi<Json<Page<MediaListItem>>>(props.siteId, 'media', { query: { ids: model.value } })).items[0] ?? null : null),
  { server: false },
)

async function loadPage(n: number) {
  loading.value = true
  try {
    const result = await adminApi<Json<Page<MediaListItem>>>(props.siteId, 'media', { query: { page: n } })
    items.value = n === 1 ? result.items : appendUnique(items.value, result.items)
    total.value = result.total
  } finally {
    loading.value = false
  }
}

async function open() {
  dialog.value?.showModal()
  if (items.value.length === 0) await loadPage(1)
}

function choose(id: string | null) {
  model.value = id
  dialog.value?.close()
}

async function uploaded(media: Json<MediaListItem>) {
  items.value = [media, ...items.value]
  total.value++
  choose(media.id)
  await refreshCurrent()
}
</script>

<template>
  <div
    class="adm-picker"
    :class="{ 'is-invalid': invalid }"
  >
    <div
      v-if="current"
      class="adm-picker__current"
    >
      <img
        :src="mediaFileUrl(siteId, current.id)"
        :alt="current.altText ?? ''"
        loading="lazy"
      >
      <div>
        <div class="adm-picker__name">
          {{ current.altText || mediaName(current) }}
        </div>
        <div class="muted mono">
          {{ mediaName(current) }}{{ current.width ? `, ${current.width}×${current.height}` : '' }}
        </div>
      </div>
    </div>
    <p
      v-else-if="model"
      class="muted"
    >
      Memuat gambar…
    </p>
    <p
      v-else
      class="muted"
    >
      Belum ada gambar.
    </p>
    <div class="adm-picker__actions">
      <button
        type="button"
        class="btn btn--small"
        @click="open"
      >
        {{ model ? 'Ganti gambar' : 'Pilih gambar' }}
      </button>
      <button
        v-if="model && allowEmpty"
        type="button"
        class="btn btn--small btn--ghost"
        @click="choose(null)"
      >
        Lepas
      </button>
    </div>

    <dialog
      ref="dialog"
      class="adm-dialog"
      :aria-label="`Pilih ${label.toLowerCase()}`"
    >
      <header class="adm-head">
        <h2>Pilih {{ label.toLowerCase() }}</h2>
        <div class="adm-head__actions">
          <button
            type="button"
            class="btn btn--small"
            @click="dialog?.close()"
          >
            Tutup
          </button>
        </div>
      </header>
      <details class="adm-dialog__upload">
        <summary>Unggah gambar baru</summary>
        <AdminMediaUploadForm
          :site-id="siteId"
          @uploaded="uploaded"
        />
      </details>
      <div class="adm-gallery">
        <button
          v-for="m in items"
          :key="m.id"
          type="button"
          class="adm-gallery__item"
          :class="{ 'is-selected': m.id === model }"
          :aria-pressed="m.id === model"
          @click="choose(m.id)"
        >
          <img
            :src="mediaFileUrl(siteId, m.id)"
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
        Belum ada media. Unggah gambar pertama di atas.
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
    </dialog>
  </div>
</template>
