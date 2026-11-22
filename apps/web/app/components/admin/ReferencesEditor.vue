<!--
  Referensi artikel (ADR-010): sumber yang dipakai, tampil di halaman
  sesuai urutan. Satu baris = judul, URL, penerbit, jenis.
-->
<script setup lang="ts">
export interface ReferenceRow {
  title: string
  url: string
  publisher: string
  kind: string
}

const model = defineModel<ReferenceRow[]>({ required: true })
const props = defineProps<{ errors: Record<string, string> }>()

const KINDS = [
  { value: 'ARTICLE', label: 'Artikel' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'IMAGE', label: 'Gambar' },
  { value: 'OTHER', label: 'Lainnya' },
]

const err = (i: number, field: string) => props.errors[`references.${i}.${field}`] ?? null

function add() {
  model.value = [...model.value, { title: '', url: '', publisher: '', kind: 'ARTICLE' }]
}
function remove(i: number) {
  model.value = model.value.filter((_, j) => j !== i)
}
function move(i: number, by: -1 | 1) {
  const next = [...model.value]
  const [row] = next.splice(i, 1)
  if (row) next.splice(i + by, 0, row)
  model.value = next
}
</script>

<template>
  <section
    class="adm-panel refs"
    aria-labelledby="judul-referensi"
  >
    <h2 id="judul-referensi">
      Sumber dan referensi
    </h2>
    <p class="field__hint">
      Tampil di akhir artikel. Cantumkan setiap sumber yang dipakai.
    </p>
    <ol
      v-if="model.length"
      class="refs__list"
    >
      <li
        v-for="(r, i) in model"
        :key="i"
        class="refs__row"
      >
        <label class="field">
          <span>Judul</span>
          <input
            v-model="r.title"
            type="text"
            :aria-invalid="!!err(i, 'title') || undefined"
          >
          <span
            v-if="err(i, 'title')"
            class="field__error"
          >{{ err(i, 'title') }}</span>
        </label>
        <label class="field">
          <span>URL</span>
          <input
            v-model="r.url"
            type="url"
            placeholder="https://…"
            :aria-invalid="!!err(i, 'url') || undefined"
          >
          <span
            v-if="err(i, 'url')"
            class="field__error"
          >{{ err(i, 'url') }}</span>
        </label>
        <div class="row">
          <label class="field">
            <span>Penerbit</span>
            <input
              v-model="r.publisher"
              type="text"
            >
          </label>
          <label class="field">
            <span>Jenis</span>
            <select v-model="r.kind">
              <option
                v-for="k in KINDS"
                :key="k.value"
                :value="k.value"
              >{{ k.label }}</option>
            </select>
          </label>
        </div>
        <div class="refs__actions">
          <button
            type="button"
            class="btn btn--ghost btn--small"
            :disabled="i === 0"
            :aria-label="`Naikkan referensi ${i + 1}`"
            @click="move(i, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="btn btn--ghost btn--small"
            :disabled="i === model.length - 1"
            :aria-label="`Turunkan referensi ${i + 1}`"
            @click="move(i, 1)"
          >
            ↓
          </button>
          <button
            type="button"
            class="btn btn--ghost btn--small"
            @click="remove(i)"
          >
            Hapus
          </button>
        </div>
      </li>
    </ol>
    <button
      type="button"
      class="btn btn--small refs__add"
      @click="add"
    >
      Tambah referensi
    </button>
  </section>
</template>

<style scoped>
.refs__list {
  list-style: decimal;
  padding-left: 1.25rem;
  margin: 0 0 0.75rem;
  display: grid;
  gap: 1rem;
}
.refs__row {
  display: grid;
  gap: 0.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--line, #e3e5e3);
}
.refs__actions {
  display: flex;
  gap: 0.5rem;
}
.refs__add {
  justify-self: start;
  width: auto;
}
</style>
