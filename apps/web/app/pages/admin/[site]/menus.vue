<!--
  Menu per lokasi (atas, bawah) sebagai pohon. Item menunjuk kategori,
  artikel, halaman, tag, route internal (/...), atau URL luar. Menghapus
  item juga menghapus sub-itemnya.
-->
<script setup lang="ts">
import type { ArticleListItem, CategoryRecord, MenuItemRecord, MenuRecord, Page, PageRecord, TagRecord } from '@framework/core'

definePageMeta({ layout: 'admin' })

const LOCATIONS = [
  { key: 'header', label: 'Menu atas' },
  { key: 'footer', label: 'Menu bawah' },
]
const TYPES = [
  { key: 'CATEGORY', label: 'Kategori' },
  { key: 'ARTICLE', label: 'Artikel' },
  { key: 'PAGE', label: 'Halaman' },
  { key: 'TAG', label: 'Tag' },
  { key: 'ROUTE', label: 'Alamat di site ini' },
  { key: 'URL', label: 'Tautan luar' },
] as const

const site = useAdminSite()
const location = ref('header')

const { data: menu, error, refresh } = await useAsyncData(
  () => `menu-${site.value?.id}-${location.value}`,
  () => (site.value ? adminApi<Json<MenuRecord>>(site.value.id, `menus/${location.value}`) : Promise.resolve(null)),
  { server: false },
)

const { data: targets } = await useAsyncData(
  () => `menu-targets-${site.value?.id}`,
  async () => {
    if (!site.value) return null
    const id = site.value.id
    const [categories, articles, pages, tags] = await Promise.all([
      adminApi<Json<CategoryRecord>[]>(id, 'categories'),
      adminApi<Json<Page<ArticleListItem>>>(id, 'articles', { query: { status: 'PUBLISHED' } }),
      adminApi<Json<PageRecord>[]>(id, 'pages'),
      adminApi<Json<TagRecord>[]>(id, 'tags'),
    ])
    return {
      CATEGORY: categories.map((c) => ({ id: c.id, label: c.name })),
      ARTICLE: articles.items.map((a) => ({ id: a.id, label: a.title })),
      PAGE: pages.map((p) => ({ id: p.id, label: p.title })),
      TAG: tags.map((t) => ({ id: t.id, label: t.name })),
    } as Record<string, { id: string; label: string }[]>
  },
  { server: false },
)

const tree = computed(() => {
  const items = menu.value?.items ?? []
  const out: (Json<MenuItemRecord> & { depth: number })[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const i of items.filter((x) => x.parentId === parent)) {
      out.push({ ...i, depth })
      walk(i.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

/**
 * Artikel yang ditunjuk menu tetapi di luar daftar pilihan (bukan 20 artikel
 * terbit terbaru) dimuat satu per satu, agar label dan pilihan tetap benar.
 */
const extraArticles = ref<{ id: string; label: string }[]>([])
watch([menu, targets], async () => {
  if (!site.value || !targets.value) return
  const known = new Set([...(targets.value['ARTICLE'] ?? []), ...extraArticles.value].map((t) => t.id))
  const wanted = [...new Set((menu.value?.items ?? []).filter((i) => i.type === 'ARTICLE' && i.targetId && !known.has(i.targetId)).map((i) => i.targetId as string))]
  const loaded = await Promise.all(wanted.map((id) => adminApi<{ id: string; title: string }>(site.value!.id, `articles/${id}`).then((a) => ({ id: a.id, label: a.title }), () => null)))
  extraArticles.value = [...extraArticles.value, ...loaded.filter((x): x is { id: string; label: string } => x !== null)]
}, { immediate: true })

const optionsFor = (type: string) => (type === 'ARTICLE' ? [...extraArticles.value, ...(targets.value?.['ARTICLE'] ?? [])] : (targets.value?.[type] ?? []))

const targetLabel = (i: Json<MenuItemRecord>) =>
  i.url ?? optionsFor(i.type).find((t) => t.id === i.targetId)?.label ?? '(target tidak ditemukan)'

const selected = ref<Json<MenuItemRecord> | null>(null)
const form = reactive({ label: '', type: 'CATEGORY' as string, targetId: '', url: '', parentId: '', sortOrder: 0, openInNewTab: false, isActive: true })
const errors = ref<Record<string, string>>({})
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const busy = ref(false)

function edit(i: Json<MenuItemRecord> | null) {
  selected.value = i
  errors.value = {}
  Object.assign(form, i
    ? { label: i.label, type: i.type, targetId: i.targetId ?? '', url: i.url ?? '', parentId: i.parentId ?? '', sortOrder: i.sortOrder, openInNewTab: i.openInNewTab, isActive: i.isActive }
    : { label: '', type: 'CATEGORY', targetId: '', url: '', parentId: '', sortOrder: (menu.value?.items.length ?? 0) + 1, openInNewTab: false, isActive: true })
}
watch(location, () => edit(null))

const usesUrl = computed(() => form.type === 'URL' || form.type === 'ROUTE')

async function save() {
  if (!site.value) return
  busy.value = true
  errors.value = {}
  message.value = null
  const item = {
    label: form.label, type: form.type, parentId: form.parentId || null,
    targetId: usesUrl.value ? null : form.targetId || null, url: usesUrl.value ? form.url.trim() || null : null,
    sortOrder: Number(form.sortOrder) || 0, openInNewTab: form.openInNewTab, isActive: form.isActive,
  }
  try {
    const result = selected.value
      ? await adminApi<Json<MenuItemRecord>>(site.value.id, `menus/${location.value}/items/${selected.value.id}`, { method: 'PUT', body: { item, updatedAt: selected.value.updatedAt } })
      : await adminApi<Json<MenuItemRecord>>(site.value.id, `menus/${location.value}/items`, { method: 'POST', body: item })
    await refresh()
    edit(menu.value?.items.find((i) => i.id === result.id) ?? null)
    message.value = { kind: 'ok', text: 'Item menu disimpan.' }
  } catch (e) {
    errors.value = apiFieldErrors(e)
    message.value = { kind: 'error', text: apiStatus(e) === 409 ? 'Item sudah diubah di tempat lain; pilih lagi dari daftar.' : apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!site.value || !selected.value) return
  if (!confirm(`Hapus ${selected.value.label} beserta sub-itemnya?`)) return
  busy.value = true
  try {
    await adminApi(site.value.id, `menus/${location.value}/items/${selected.value.id}`, { method: 'DELETE', query: { updatedAt: selected.value.updatedAt } })
    message.value = { kind: 'ok', text: `${selected.value.label} dihapus.` }
    edit(null)
    await refresh()
  } catch (e) {
    message.value = { kind: 'error', text: apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}

/** Calon induk: bukan item itu sendiri dan bukan turunannya. */
const parentOptions = computed(() => {
  const self = selected.value?.id
  if (!self) return tree.value
  const blocked = new Set([self])
  for (const i of tree.value) if (i.parentId && blocked.has(i.parentId)) blocked.add(i.id)
  return tree.value.filter((i) => !blocked.has(i.id))
})
const err = (field: string) => fieldError(errors.value, field)
</script>

<template>
  <div v-if="site">
    <header class="adm-head">
      <h1>Menu</h1>
      <div
        class="filters"
        style="margin: 0"
        role="tablist"
      >
        <button
          v-for="l in LOCATIONS"
          :key="l.key"
          type="button"
          role="tab"
          class="btn btn--small"
          :class="{ 'btn--primary': location === l.key }"
          :aria-selected="location === l.key"
          @click="location = l.key"
        >
          {{ l.label }}
        </button>
      </div>
      <div class="adm-head__actions">
        <button
          type="button"
          class="btn"
          @click="edit(null)"
        >
          Item baru
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
      <div
        v-if="tree.length"
        class="table-scroll"
      >
        <table
          class="table"
        >
          <thead>
            <tr>
              <th>Label</th>
              <th>Menuju</th>
              <th>Urutan</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="i in tree"
              :key="i.id"
              :class="{ 'is-selected': selected?.id === i.id }"
            >
              <td :class="`indent-${Math.min(i.depth, 3)}`">
                <a
                  class="table__title"
                  href="#"
                  @click.prevent="edit(i)"
                >{{ i.label }}</a>
                <span
                  v-if="!i.isActive"
                  class="muted"
                > (nonaktif)</span>
              </td>
              <td>
                <span class="muted">{{ TYPES.find((t) => t.key === i.type)?.label }}:</span>
                {{ targetLabel(i) }}
              </td>
              <td>{{ i.sortOrder }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p
        v-else
        class="muted"
      >
        Menu ini belum punya item.
      </p>

      <form
        class="adm-panel"
        @submit.prevent="save"
      >
        <h2>{{ selected ? `Ubah ${selected.label}` : 'Item baru' }}</h2>
        <label class="field">
          <span>Label</span>
          <input
            v-model="form.label"
            type="text"
            required
            :aria-invalid="!!err('label') || undefined"
          >
        </label>
        <label class="field">
          <span>Jenis</span>
          <select
            v-model="form.type"
            @change="form.targetId = ''; form.url = ''"
          >
            <option
              v-for="t in TYPES"
              :key="t.key"
              :value="t.key"
            >
              {{ t.label }}
            </option>
          </select>
        </label>
        <label
          v-if="!usesUrl"
          class="field"
        >
          <span>Tujuan</span>
          <select
            v-model="form.targetId"
            :aria-invalid="!!err('targetId') || undefined"
          >
            <option
              value=""
              disabled
            >
              Pilih
            </option>
            <option
              v-for="t in optionsFor(form.type)"
              :key="t.id"
              :value="t.id"
            >
              {{ t.label }}
            </option>
          </select>
          <span
            v-if="form.type === 'ARTICLE'"
            class="field__hint"
          >20 artikel terbit terbaru, ditambah artikel yang sedang dipakai menu.</span>
          <span
            v-if="err('targetId')"
            class="field__error"
          >{{ err('targetId') }}</span>
        </label>
        <label
          v-else
          class="field"
        >
          <span>{{ form.type === 'URL' ? 'Tautan' : 'Alamat' }}</span>
          <input
            v-model="form.url"
            type="text"
            :class="{ mono: form.type === 'ROUTE' }"
            :placeholder="form.type === 'URL' ? 'https://…' : '/search'"
            :aria-invalid="!!err('url') || undefined"
          >
          <span
            v-if="err('url')"
            class="field__error"
          >{{ err('url') }}</span>
        </label>
        <label class="field">
          <span>Induk</span>
          <select
            v-model="form.parentId"
            :aria-invalid="!!err('parentId') || undefined"
          >
            <option value="">Tanpa induk</option>
            <option
              v-for="i in parentOptions"
              :key="i.id"
              :value="i.id"
            >
              {{ '— '.repeat(i.depth) }}{{ i.label }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>Urutan</span>
          <input
            v-model.number="form.sortOrder"
            type="number"
            min="0"
          >
        </label>
        <label class="check">
          <input
            v-model="form.openInNewTab"
            type="checkbox"
          >
          Buka di tab baru
        </label>
        <label class="check">
          <input
            v-model="form.isActive"
            type="checkbox"
          >
          Aktif
        </label>
        <div class="adm-head__actions">
          <button
            v-if="selected"
            type="button"
            class="btn btn--danger"
            :disabled="busy"
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
    </div>
  </div>
</template>
