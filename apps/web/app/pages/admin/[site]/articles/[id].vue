<!--
  Editor artikel (M4 4.2). /admin/:site/articles/new = artikel baru.
  Kolom utama: judul, ringkasan, editor block. Panel kanan: terbit (status,
  tanggal di zona waktu site), pengelompokan (kategori, tag, penulis,
  format), gambar utama, SEO. Simpan mengirim versi yang dibaca saat form
  dibuka; versi berbeda (diubah di tab lain) -> 409 dan diminta muat ulang.
-->
<script setup lang="ts">
import type { ReferenceRow } from '~/components/admin/ReferencesEditor.vue'
import type { ArticleRecord, Block, CategoryRecord, RevisionItem, TagRecord } from '@framework/core'

definePageMeta({ layout: 'admin' })

const site = useAdminSite()
const route = useRoute()
const isNew = computed(() => route.params['id'] === 'new')
const siteId = computed(() => site.value?.id ?? '')

interface Form {
  title: string
  slug: string
  excerpt: string
  blocks: Block[]
  categoryId: string
  authorId: string
  featuredMediaId: string | null
  format: string
  status: string
  isFeatured: boolean
  publishedLocal: string
  tagIds: string[]
  references: ReferenceRow[]
  seo: { title: string; description: string; og_image_id: string | null; canonical: string; robots: string }
  changeNote: string
}

const emptyForm = (): Form => ({
  title: '', slug: '', excerpt: '', blocks: [{ type: 'paragraph', text: '' }], categoryId: '', authorId: '',
  featuredMediaId: null, format: 'STANDARD', status: 'DRAFT', isFeatured: false, publishedLocal: '', tagIds: [], references: [],
  seo: { title: '', description: '', og_image_id: null, canonical: '', robots: '' }, changeNote: '',
})

const form = reactive<Form>(emptyForm())
const article = ref<Json<ArticleRecord> | null>(null)
const errors = ref<Record<string, string>>({})
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const conflict = ref(false)
const busy = ref(false)
const saved = ref('')
/** Tanggal terbit seperti saat dimuat; tidak diubah = tidak dikirim. */
const loadedPublished = ref('')

const { data: options } = await useAsyncData(
  () => `article-options-${siteId.value}`,
  async () => {
    if (!siteId.value) return null
    const [categories, tags, authors] = await Promise.all([
      adminApi<Json<CategoryRecord>[]>(siteId.value, 'categories'),
      adminApi<Json<TagRecord>[]>(siteId.value, 'tags'),
      adminApi<{ id: string; name: string; status: string }[]>(siteId.value, 'authors'),
    ])
    return { categories, tags, authors }
  },
  { server: false },
)

/** Kategori berurutan sebagai pohon: induk lalu anak-anaknya, dengan kedalaman. */
const categoryTree = computed(() => {
  const all = options.value?.categories ?? []
  const out: { id: string; name: string; depth: number; hidden: boolean }[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const c of all.filter((x) => x.parentId === parent)) {
      out.push({ id: c.id, name: c.name, depth, hidden: c.status === 'HIDDEN' })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

function fill(a: Json<ArticleRecord>) {
  article.value = a
  const tz = site.value?.timezone ?? 'UTC'
  Object.assign(form, {
    title: a.title, slug: a.slug, excerpt: a.excerpt ?? '', blocks: structuredClone(a.body.blocks), categoryId: a.categoryId,
    authorId: a.authorId ?? '', featuredMediaId: a.featuredMediaId, format: a.format, status: a.status, isFeatured: a.isFeatured,
    publishedLocal: isoToZonedInput(a.publishedAt, tz), tagIds: [...a.tagIds],
    references: a.references.map((r) => ({ title: r.title, url: r.url, publisher: r.publisher ?? '', kind: r.kind })),
    seo: { title: a.seo.title ?? '', description: a.seo.description ?? '', og_image_id: a.seo.og_image_id ?? null, canonical: a.seo.canonical ?? '', robots: a.seo.robots ?? '' },
    changeNote: '',
  })
  loadedPublished.value = form.publishedLocal
  saved.value = snapshot()
}

async function load() {
  conflict.value = false
  errors.value = {}
  if (isNew.value || !siteId.value) {
    Object.assign(form, emptyForm())
    saved.value = snapshot()
    return
  }
  try {
    fill(await adminApi<Json<ArticleRecord>>(siteId.value, `articles/${String(route.params['id'])}`))
  } catch (e) {
    message.value = { kind: 'error', text: apiErrorMessage(e) }
  }
}

const { data: revisions, refresh: refreshRevisions } = await useAsyncData(
  () => `revisions-${siteId.value}-${String(route.params['id'])}`,
  () => (isNew.value || !siteId.value ? Promise.resolve([]) : adminApi<Json<RevisionItem>[]>(siteId.value, `articles/${String(route.params['id'])}/revisions`)),
  { server: false },
)

onMounted(load)
watch(() => route.params['id'], load)

const snapshot = () => JSON.stringify({ ...form, changeNote: '' })
const dirty = computed(() => snapshot() !== saved.value)

function payload() {
  const tz = site.value?.timezone ?? 'UTC'
  return {
    title: form.title,
    slug: form.slug.trim() || undefined,
    excerpt: form.excerpt.trim() || null,
    body: { version: 1, blocks: cleanBlocks(form.blocks) },
    categoryId: form.categoryId,
    authorId: form.authorId || null,
    featuredMediaId: form.featuredMediaId,
    format: form.format,
    status: form.status,
    isFeatured: form.isFeatured,
    // Tidak diubah = tidak dikirim (detik tersimpan tetap utuh); dikosongkan
    // = null (Terbit tanpa tanggal = sekarang).
    publishedAt: !isNew.value && form.publishedLocal === loadedPublished.value
      ? undefined
      : form.publishedLocal ? zonedInputToIso(form.publishedLocal, tz) : null,
    tagIds: form.tagIds,
    seo: mergeSeo(article.value?.seo ?? {}, form.seo),
    attributes: article.value?.attributes ?? {},
    references: form.references.map((r) => ({ title: r.title, url: r.url.trim(), kind: r.kind, ...(r.publisher.trim() ? { publisher: r.publisher } : {}) })),
  }
}

async function save() {
  if (!site.value) return
  busy.value = true
  errors.value = {}
  message.value = null
  try {
    if (isNew.value) {
      const created = await adminApi<Json<ArticleRecord>>(site.value.id, 'articles', { method: 'POST', body: payload() })
      fill(created)
      message.value = { kind: 'ok', text: 'Artikel dibuat.' }
      await navigateTo(`/admin/${site.value.code}/articles/${created.id}`, { replace: true })
    } else if (article.value) {
      const updated = await adminApi<Json<ArticleRecord>>(site.value.id, `articles/${article.value.id}`, {
        method: 'PUT',
        body: { article: payload(), version: article.value.version, changeNote: form.changeNote || undefined },
      })
      fill(updated)
      message.value = { kind: 'ok', text: savedText(updated) }
      void refreshRevisions()
    }
  } catch (e) {
    if (apiStatus(e) === 409) conflict.value = true
    errors.value = apiFieldErrors(e)
    message.value = { kind: 'error', text: apiStatus(e) === 422 ? 'Periksa kembali isian yang ditandai.' : apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}

function savedText(a: Json<ArticleRecord>) {
  const shown = displayStatus(a.status, a.publishedAt)
  if (shown.key === 'scheduled' && site.value) return `Disimpan. Terjadwal terbit ${formatSiteDate(a.publishedAt, site.value)}.`
  if (shown.key === 'published') return 'Disimpan dan tampil di site.'
  return 'Disimpan.'
}

async function archive() {
  if (!site.value || !article.value) return
  if (!confirm('Arsipkan artikel ini? Artikel tidak lagi tampil di site.')) return
  busy.value = true
  try {
    fill(await adminApi<Json<ArticleRecord>>(site.value.id, `articles/${article.value.id}/archive`, { method: 'POST', body: { version: article.value.version } }))
    message.value = { kind: 'ok', text: 'Artikel diarsipkan.' }
    void refreshRevisions()
  } catch (e) {
    if (apiStatus(e) === 409) conflict.value = true
    message.value = { kind: 'error', text: apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}

function toggleTag(id: string, on: boolean) {
  form.tagIds = on ? [...form.tagIds, id] : form.tagIds.filter((t) => t !== id)
}

const err = (field: string) => fieldError(errors.value, field)
const zone = computed(() => (site.value ? zoneLabel(site.value.timezone) : ''))
const scheduledHint = computed(() => {
  if (form.status !== 'PUBLISHED') return 'Tanggal dipakai saat status Terbit.'
  if (!form.publishedLocal) return 'Kosong: terbit saat disimpan.'
  const iso = zonedInputToIso(form.publishedLocal, site.value?.timezone ?? 'UTC')
  return iso && new Date(iso) > new Date() ? 'Tanggal mendatang: artikel dijadwalkan.' : 'Tanggal sudah lewat: langsung tampil.'
})

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
      <NuxtLink :to="`/admin/${site.code}/articles`">
        Artikel
      </NuxtLink>
      <span class="muted">/</span>
      <h1>{{ isNew ? 'Artikel baru' : form.title || 'Tanpa judul' }}</h1>
      <AdminStatusBadge
        v-if="article"
        :status="article.status"
        :published-at="article.publishedAt"
      />
      <div class="adm-head__actions">
        <span
          v-if="dirty"
          class="muted"
        >Belum disimpan</span>
        <button
          v-if="article && article.status !== 'ARCHIVED'"
          type="button"
          class="btn btn--danger"
          :disabled="busy"
          @click="archive"
        >
          Arsipkan
        </button>
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
      Artikel ini sudah diubah di tempat lain sejak Anda membukanya.
      <button
        type="button"
        class="btn btn--small"
        @click="load"
      >
        Muat versi terbaru
      </button>
      <span class="muted">(perubahan Anda di form ini akan hilang)</span>
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
          placeholder="Judul artikel"
          aria-label="Judul"
          :aria-invalid="!!err('title') || undefined"
        >
        <p
          v-if="err('title')"
          class="field__error"
        >
          {{ err('title') }}
        </p>
        <label
          class="field"
          style="margin-top: 1rem"
        >
          <span>Ringkasan</span>
          <textarea
            v-model="form.excerpt"
            rows="2"
            maxlength="1000"
            placeholder="Satu atau dua kalimat untuk kartu artikel dan deskripsi bawaan"
            :aria-invalid="!!err('excerpt') || undefined"
          />
          <span
            v-if="err('excerpt')"
            class="field__error"
          >{{ err('excerpt') }}</span>
        </label>
        <AdminBlockEditor
          v-model="form.blocks"
          :site-id="site.id"
          :errors="errors"
        />
        <p
          v-if="err('body') && !Object.keys(errors).some((k) => k.startsWith('body.blocks'))"
          class="field__error"
        >
          {{ err('body') }}
        </p>
        <AdminReferencesEditor
          v-model="form.references"
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
              <option value="REVIEW">Perlu ditinjau</option>
              <option value="PUBLISHED">Terbit</option>
              <option
                v-if="form.status === 'ARCHIVED'"
                value="ARCHIVED"
              >
                Arsip
              </option>
            </select>
          </label>
          <label class="field">
            <span>Tanggal terbit ({{ zone }})</span>
            <input
              v-model="form.publishedLocal"
              type="datetime-local"
              :aria-invalid="!!err('publishedAt') || undefined"
            >
            <span
              v-if="err('publishedAt')"
              class="field__error"
            >{{ err('publishedAt') }}</span>
            <span
              v-else
              class="field__hint"
            >{{ scheduledHint }}</span>
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
              v-else-if="article?.publicPath"
              class="field__hint mono"
            >{{ article.publicPath }}</span>
            <span
              v-else
              class="field__hint"
            >Mengganti slug artikel yang sudah tampil membuat pengalihan dari alamat lama.</span>
          </label>
          <label
            v-if="!isNew"
            class="field"
          >
            <span>Catatan perubahan</span>
            <input
              v-model="form.changeNote"
              type="text"
              placeholder="Opsional, masuk ke riwayat revisi"
            >
          </label>
        </section>

        <section class="adm-panel">
          <h2>Pengelompokan</h2>
          <label class="field">
            <span>Kategori</span>
            <select
              v-model="form.categoryId"
              :aria-invalid="!!err('categoryId') || undefined"
            >
              <option
                value=""
                disabled
              >
                Pilih kategori
              </option>
              <option
                v-for="c in categoryTree"
                :key="c.id"
                :value="c.id"
              >
                {{ '— '.repeat(c.depth) }}{{ c.name }}{{ c.hidden ? ' (disembunyikan)' : '' }}
              </option>
            </select>
            <span
              v-if="err('categoryId')"
              class="field__error"
            >{{ err('categoryId') }}</span>
          </label>
          <div class="field">
            <span>Tag</span>
            <div
              v-if="options?.tags.length"
              class="adm-chips"
            >
              <label
                v-for="t in options.tags"
                :key="t.id"
                class="check"
              >
                <input
                  type="checkbox"
                  :checked="form.tagIds.includes(t.id)"
                  @change="toggleTag(t.id, ($event.target as HTMLInputElement).checked)"
                >
                {{ t.name }}
              </label>
            </div>
            <span
              v-else
              class="field__hint"
            >Belum ada tag. Buat di menu Tag.</span>
            <span
              v-if="err('tagIds')"
              class="field__error"
            >{{ err('tagIds') }}</span>
          </div>
          <label class="field">
            <span>Penulis</span>
            <select v-model="form.authorId">
              <option value="">Tanpa penulis</option>
              <option
                v-for="a in options?.authors ?? []"
                :key="a.id"
                :value="a.id"
              >
                {{ a.name }}{{ a.status === 'HIDDEN' ? ' (disembunyikan)' : '' }}
              </option>
            </select>
            <span
              v-if="err('authorId')"
              class="field__error"
            >{{ err('authorId') }}</span>
          </label>
          <div class="row">
            <label class="field">
              <span>Format</span>
              <select v-model="form.format">
                <option value="STANDARD">Standar</option>
                <option value="LISTICLE">Daftar</option>
                <option value="GALLERY">Galeri</option>
                <option value="VIDEO">Video</option>
              </select>
            </label>
          </div>
          <label class="check">
            <input
              v-model="form.isFeatured"
              type="checkbox"
            >
            Pilihan redaksi
          </label>
        </section>

        <section class="adm-panel">
          <h2>Gambar utama</h2>
          <AdminMediaPicker
            v-model="form.featuredMediaId"
            :site-id="site.id"
            :invalid="!!err('featuredMediaId')"
            label="Gambar utama"
          />
          <span
            v-if="err('featuredMediaId')"
            class="field__error"
          >{{ err('featuredMediaId') }}</span>
        </section>

        <section class="adm-panel">
          <h2>SEO</h2>
          <label class="field">
            <span>Judul di mesin pencari</span>
            <input
              v-model="form.seo.title"
              type="text"
              :placeholder="form.title"
              :aria-invalid="!!err('seo.title') || undefined"
            >
          </label>
          <label class="field">
            <span>Deskripsi</span>
            <textarea
              v-model="form.seo.description"
              rows="3"
              :placeholder="form.excerpt || 'Bawaan: ringkasan artikel'"
              :aria-invalid="!!err('seo.description') || undefined"
            />
            <span class="field__hint">{{ form.seo.description.length }}/320 karakter</span>
          </label>
          <label class="field">
            <span>Gambar saat dibagikan</span>
            <AdminMediaPicker
              v-model="form.seo.og_image_id"
              :site-id="site.id"
              :invalid="!!err('seo.og_image_id')"
              label="Gambar saat dibagikan"
            />
            <span class="field__hint">Kosong: memakai gambar utama.</span>
          </label>
          <label class="field">
            <span>Indeks mesin pencari</span>
            <select v-model="form.seo.robots">
              <option value="">Boleh diindeks</option>
              <option value="noindex">Jangan diindeks</option>
              <option value="noindex, follow">Jangan diindeks, tautan boleh diikuti</option>
              <option value="noindex, nofollow">Jangan diindeks dan jangan ikuti tautan</option>
            </select>
          </label>
          <label class="field">
            <span>URL kanonik</span>
            <input
              v-model="form.seo.canonical"
              type="text"
              placeholder="Kosong: alamat artikel ini"
              :aria-invalid="!!err('seo.canonical') || undefined"
            >
            <span
              v-if="err('seo')"
              class="field__error"
            >{{ err('seo') }}</span>
          </label>
        </section>

        <section
          v-if="revisions?.length"
          class="adm-panel"
        >
          <h2>Riwayat</h2>
          <ol
            class="muted"
            style="margin: 0; padding-left: 1.25rem"
          >
            <li
              v-for="r in revisions"
              :key="r.revisionNo"
            >
              Versi {{ r.revisionNo }}, {{ formatSiteDate(r.createdAt, site) }}<span v-if="r.changeNote">: {{ r.changeNote }}</span>
            </li>
          </ol>
        </section>
      </aside>
    </div>
  </form>
</template>
