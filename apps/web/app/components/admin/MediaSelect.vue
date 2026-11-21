<!--
  Pilih media milik site (daftar terbaru). Upload dan pratinjau gambar
  ditambahkan di 4.3; sampai saat itu media dikenali dari nama file dan alt.
-->
<script setup lang="ts">
import type { MediaListItem, Page } from '@framework/core'

// allowEmpty default true: prop boolean yang tidak dikirim dianggap false oleh Vue.
const props = withDefaults(defineProps<{ siteId: string; id?: string; invalid?: boolean; allowEmpty?: boolean }>(), { id: undefined, invalid: false, allowEmpty: true })
const model = defineModel<string | null>({ required: true })

const { data } = useAsyncData(`media-${props.siteId}`, () => adminApi<Json<Page<MediaListItem>>>(props.siteId, 'media'), { server: false })

// Media yang sedang terpasang tetapi di luar halaman pertama tetap harus
// muncul sebagai pilihan; tanpa ini select tampil "Tanpa gambar".
const missing = computed(() => (model.value && data.value && !data.value.items.some((m) => m.id === model.value) ? model.value : null))
const { data: extra } = useAsyncData(
  () => `media-${props.siteId}-${missing.value ?? ''}`,
  () => (missing.value ? adminApi<Json<Page<MediaListItem>>>(props.siteId, 'media', { query: { ids: missing.value } }) : Promise.resolve(null)),
  { server: false },
)
const options = computed(() => [...(extra.value?.items ?? []), ...(data.value?.items ?? [])])

// v-model lewat computed: dengan :value, pilihan yang dimuat belakangan tidak
// ikut terpilih (select dirender sebelum opsinya ada).
const selected = computed({
  get: () => model.value ?? '',
  set: (value: string) => {
    model.value = value || null
  },
})

const label = (m: Json<MediaListItem>) => {
  const file = m.storageKey.split('/').at(-1) ?? m.storageKey
  const size = m.width && m.height ? ` (${m.width}×${m.height})` : ''
  return `${file}${size}${m.altText ? ` · ${m.altText}` : ''}`
}
</script>

<template>
  <select
    :id="id"
    v-model="selected"
    :aria-invalid="invalid || undefined"
  >
    <option
      v-if="allowEmpty"
      value=""
    >
      Tanpa gambar
    </option>
    <option
      v-for="m in options"
      :key="m.id"
      :value="m.id"
    >
      {{ label(m) }}
    </option>
  </select>
</template>
