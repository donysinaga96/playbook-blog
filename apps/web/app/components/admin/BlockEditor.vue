<!--
  Editor block v1 (usulan M4-C): paragraf, judul, gambar, kutipan, daftar,
  sematan. Setiap block satu baris: parit kiri berisi jenis dan alat (naik,
  turun, hapus), isian di kanan. Validasi akhir tetap di server; galat per
  block ditampilkan dari field 'body.blocks.<n>...'.
-->
<script setup lang="ts">
import type { Block } from '@framework/core'

const props = defineProps<{ siteId: string; errors?: Record<string, string> }>()
const blocks = defineModel<Block[]>({ required: true })

const TYPES: { type: Block['type']; label: string }[] = [
  { type: 'paragraph', label: 'Paragraf' },
  { type: 'heading', label: 'Judul' },
  { type: 'image', label: 'Gambar' },
  { type: 'quote', label: 'Kutipan' },
  { type: 'list', label: 'Daftar' },
  { type: 'embed', label: 'Sematan' },
]
const labelOf = (type: string) => TYPES.find((t) => t.type === type)?.label ?? type

function emptyBlock(type: Block['type']): Block {
  switch (type) {
    case 'paragraph': return { type, text: '' }
    case 'heading': return { type, level: 2, text: '' }
    case 'image': return { type, mediaId: '' }
    case 'quote': return { type, text: '' }
    case 'list': return { type, style: 'bullet', items: [''] }
    case 'embed': return { type, provider: 'youtube', url: '' }
  }
}

function add(type: Block['type']) {
  blocks.value = [...blocks.value, emptyBlock(type)]
}

function move(index: number, delta: number) {
  const next = [...blocks.value]
  const [item] = next.splice(index, 1)
  if (!item) return
  next.splice(index + delta, 0, item)
  blocks.value = next
}

function remove(index: number) {
  blocks.value = blocks.value.filter((_, i) => i !== index)
}

function update(index: number, patch: Partial<Block>) {
  blocks.value = blocks.value.map((b, i) => (i === index ? ({ ...b, ...patch } as Block) : b))
}

/** Daftar diedit sebagai teks, satu butir per baris. */
const listText = (b: Block) => (b.type === 'list' ? b.items.join('\n') : '')

const err = (index: number) => (props.errors ? fieldError(props.errors, `body.blocks.${index}`) : null)

const EMBED_HINT: Record<string, string> = {
  youtube: 'Tautan YouTube, mis. https://www.youtube.com/watch?v=…',
  vimeo: 'Tautan Vimeo, mis. https://vimeo.com/123456789',
  x: 'Tautan postingan X; tampil sebagai tautan (tanpa skrip X).',
}
</script>

<template>
  <div class="adm-blocks">
    <p
      v-if="blocks.length === 0"
      class="adm-blocks__empty"
    >
      Isi artikel masih kosong. Tambahkan paragraf pertama di bawah.
    </p>
    <div
      v-for="(block, index) in blocks"
      :key="index"
      class="adm-block"
    >
      <div class="adm-block__gutter">
        <span class="adm-block__type">{{ labelOf(block.type) }}</span>
        <div class="adm-block__tools">
          <button
            type="button"
            :disabled="index === 0"
            :aria-label="`Naikkan ${labelOf(block.type).toLowerCase()} ke-${index + 1}`"
            @click="move(index, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            :disabled="index === blocks.length - 1"
            :aria-label="`Turunkan ${labelOf(block.type).toLowerCase()} ke-${index + 1}`"
            @click="move(index, 1)"
          >
            ↓
          </button>
          <button
            type="button"
            :aria-label="`Hapus ${labelOf(block.type).toLowerCase()} ke-${index + 1}`"
            @click="remove(index)"
          >
            ✕
          </button>
        </div>
      </div>

      <div class="adm-block__body">
        <textarea
          v-if="block.type === 'paragraph'"
          class="is-paragraph"
          :value="block.text"
          aria-label="Teks paragraf"
          placeholder="Tulis paragraf…"
          @input="update(index, { text: ($event.target as HTMLTextAreaElement).value })"
        />

        <div
          v-else-if="block.type === 'heading'"
          class="adm-block__inline"
        >
          <select
            :value="block.level"
            aria-label="Tingkat judul"
            @change="update(index, { level: Number(($event.target as HTMLSelectElement).value) as 2 | 3 | 4 })"
          >
            <option :value="2">
              Judul bagian
            </option>
            <option :value="3">
              Sub-judul
            </option>
            <option :value="4">
              Sub-sub-judul
            </option>
          </select>
          <input
            type="text"
            class="is-heading"
            :value="block.text"
            aria-label="Teks judul"
            placeholder="Judul bagian"
            @input="update(index, { text: ($event.target as HTMLInputElement).value })"
          >
        </div>

        <template v-else-if="block.type === 'image'">
          <AdminMediaSelect
            :site-id="siteId"
            :model-value="block.mediaId || null"
            :allow-empty="false"
            aria-label="Gambar"
            @update:model-value="update(index, { mediaId: $event ?? '' })"
          />
          <input
            type="text"
            :value="block.caption ?? ''"
            aria-label="Keterangan gambar"
            placeholder="Keterangan (opsional)"
            @input="update(index, { caption: ($event.target as HTMLInputElement).value || undefined })"
          >
        </template>

        <template v-else-if="block.type === 'quote'">
          <textarea
            :value="block.text"
            aria-label="Teks kutipan"
            placeholder="Kutipan"
            @input="update(index, { text: ($event.target as HTMLTextAreaElement).value })"
          />
          <input
            type="text"
            :value="block.cite ?? ''"
            aria-label="Sumber kutipan"
            placeholder="Sumber (opsional)"
            @input="update(index, { cite: ($event.target as HTMLInputElement).value || undefined })"
          >
        </template>

        <template v-else-if="block.type === 'list'">
          <select
            :value="block.style"
            aria-label="Jenis daftar"
            @change="update(index, { style: ($event.target as HTMLSelectElement).value as 'bullet' | 'numbered' })"
          >
            <option value="bullet">
              Berbutir
            </option>
            <option value="numbered">
              Bernomor (langkah)
            </option>
          </select>
          <textarea
            :value="listText(block)"
            aria-label="Isi daftar, satu butir per baris"
            placeholder="Satu butir per baris"
            @input="update(index, { items: ($event.target as HTMLTextAreaElement).value.split('\n') })"
          />
        </template>

        <div
          v-else-if="block.type === 'embed'"
          class="adm-block__inline"
        >
          <select
            :value="block.provider"
            aria-label="Penyedia"
            @change="update(index, { provider: ($event.target as HTMLSelectElement).value as 'youtube' | 'vimeo' | 'x' })"
          >
            <option value="youtube">
              YouTube
            </option>
            <option value="vimeo">
              Vimeo
            </option>
            <option value="x">
              X
            </option>
          </select>
          <input
            type="url"
            :value="block.url"
            aria-label="Tautan sematan"
            :placeholder="EMBED_HINT[block.provider]"
            @input="update(index, { url: ($event.target as HTMLInputElement).value })"
          >
        </div>

        <p
          v-if="err(index)"
          class="field__error"
        >
          {{ err(index) }}
        </p>
      </div>
    </div>

    <div class="adm-blocks__add">
      <span>Tambah</span>
      <button
        v-for="t in TYPES"
        :key="t.type"
        type="button"
        class="btn btn--small"
        @click="add(t.type)"
      >
        {{ t.label }}
      </button>
    </div>
  </div>
</template>
