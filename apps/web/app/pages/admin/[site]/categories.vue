<!--
  Kategori sebagai pohon (induk lalu anak), dengan form di kanan untuk
  menambah atau mengubah. Kategori tidak dihapus, hanya disembunyikan:
  artikel di dalamnya tetap ada dan masih bisa dibuka lewat alamatnya.
-->
<script setup lang="ts">
import type { CategoryRecord } from '@framework/core'

definePageMeta({ layout: 'admin' })

const site = useAdminSite()
const { data, error, refresh } = await useAsyncData(
  () => `categories-${site.value?.id}`,
  () => (site.value ? adminApi<Json<CategoryRecord>[]>(site.value.id, 'categories') : Promise.resolve(null)),
  { server: false },
)

const tree = computed(() => {
  const all = data.value ?? []
  const out: (Json<CategoryRecord> & { depth: number })[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const c of all.filter((x) => x.parentId === parent)) {
      out.push({ ...c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

const selected = ref<Json<CategoryRecord> | null>(null)
const form = reactive({ name: '', slug: '', parentId: '', description: '', sortOrder: 0, seoTitle: '', seoDescription: '' })
const errors = ref<Record<string, string>>({})
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const busy = ref(false)

function edit(c: Json<CategoryRecord> | null) {
  selected.value = c
  errors.value = {}
  Object.assign(form, c
    ? { name: c.name, slug: c.slug, parentId: c.parentId ?? '', description: c.description ?? '', sortOrder: c.sortOrder, seoTitle: c.seo.title ?? '', seoDescription: c.seo.description ?? '' }
    : { name: '', slug: '', parentId: '', description: '', sortOrder: 0, seoTitle: '', seoDescription: '' })
}

function input() {
  return {
    name: form.name, slug: form.slug.trim() || undefined, parentId: form.parentId || null,
    description: form.description.trim() || null, sortOrder: Number(form.sortOrder) || 0,
    seo: mergeSeo(selected.value?.seo ?? {}, { title: form.seoTitle, description: form.seoDescription }),
  }
}

async function save(status?: 'ACTIVE' | 'HIDDEN') {
  if (!site.value) return
  busy.value = true
  errors.value = {}
  message.value = null
  try {
    const result = selected.value
      ? await adminApi<Json<CategoryRecord>>(site.value.id, `categories/${selected.value.id}`, { method: 'PUT', body: { category: input(), updatedAt: selected.value.updatedAt, status } })
      : await adminApi<Json<CategoryRecord>>(site.value.id, 'categories', { method: 'POST', body: input() })
    await refresh()
    edit(data.value?.find((c) => c.id === result.id) ?? null)
    message.value = { kind: 'ok', text: status === 'HIDDEN' ? 'Kategori disembunyikan.' : status === 'ACTIVE' ? 'Kategori ditampilkan lagi.' : 'Kategori disimpan.' }
  } catch (e) {
    errors.value = apiFieldErrors(e)
    message.value = { kind: 'error', text: apiStatus(e) === 409 ? 'Kategori sudah diubah di tempat lain; pilih lagi dari daftar.' : apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}

/** Calon induk: bukan kategori itu sendiri dan bukan turunannya. */
const parentOptions = computed(() => {
  const self = selected.value?.id
  if (!self) return tree.value
  const blocked = new Set([self])
  for (const c of tree.value) if (c.parentId && blocked.has(c.parentId)) blocked.add(c.id)
  return tree.value.filter((c) => !blocked.has(c.id))
})
const err = (field: string) => fieldError(errors.value, field)
</script>

<template>
  <div v-if="site">
    <header class="adm-head">
      <h1>Kategori</h1>
      <div class="adm-head__actions">
        <button
          type="button"
          class="btn"
          @click="edit(null)"
        >
          Kategori baru
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
    <div class="adm-split">
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Urutan</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in tree"
              :key="c.id"
              :class="{ 'is-selected': selected?.id === c.id }"
            >
              <td :class="`indent-${Math.min(c.depth, 3)}`">
                <a
                  class="table__title"
                  href="#"
                  @click.prevent="edit(c)"
                >{{ c.name }}</a>
              </td>
              <td class="mono">
                {{ c.slug }}
              </td>
              <td>
                <AdminStatusBadge :status="c.status" />
              </td>
              <td>{{ c.sortOrder }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <form
        class="adm-panel"
        @submit.prevent="save()"
      >
        <h2>{{ selected ? `Ubah ${selected.name}` : 'Kategori baru' }}</h2>
        <label class="field">
          <span>Nama</span>
          <input
            v-model="form.name"
            type="text"
            required
            :aria-invalid="!!err('name') || undefined"
          >
        </label>
        <label class="field">
          <span>Slug</span>
          <input
            v-model="form.slug"
            type="text"
            class="mono"
            placeholder="dibuat dari nama"
            :aria-invalid="!!err('slug') || undefined"
          >
          <span
            v-if="err('slug')"
            class="field__error"
          >{{ err('slug') }}</span>
        </label>
        <label class="field">
          <span>Induk</span>
          <select
            v-model="form.parentId"
            :aria-invalid="!!err('parentId') || undefined"
          >
            <option value="">Tanpa induk</option>
            <option
              v-for="c in parentOptions"
              :key="c.id"
              :value="c.id"
            >
              {{ '— '.repeat(c.depth) }}{{ c.name }}
            </option>
          </select>
          <span
            v-if="err('parentId')"
            class="field__error"
          >{{ err('parentId') }}</span>
        </label>
        <label class="field">
          <span>Deskripsi</span>
          <textarea
            v-model="form.description"
            rows="3"
          />
        </label>
        <label class="field">
          <span>Urutan</span>
          <input
            v-model.number="form.sortOrder"
            type="number"
            min="0"
          >
        </label>
        <label class="field">
          <span>Judul di mesin pencari</span>
          <input
            v-model="form.seoTitle"
            type="text"
            :placeholder="form.name"
          >
        </label>
        <label class="field">
          <span>Deskripsi di mesin pencari</span>
          <textarea
            v-model="form.seoDescription"
            rows="2"
          />
        </label>
        <div class="adm-head__actions">
          <button
            v-if="selected"
            type="button"
            class="btn"
            :disabled="busy"
            @click="save(selected.status === 'HIDDEN' ? 'ACTIVE' : 'HIDDEN')"
          >
            {{ selected.status === 'HIDDEN' ? 'Tampilkan lagi' : 'Sembunyikan' }}
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
    </div>
  </div>
</template>
