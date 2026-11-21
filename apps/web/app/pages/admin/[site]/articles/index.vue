<!-- Daftar artikel admin: semua status, cari judul, terbaru diubah dulu. -->
<script setup lang="ts">
import type { AdminArticleQuery, ArticleListItem, Page } from '@framework/core'

definePageMeta({ layout: 'admin' })

const site = useAdminSite()
const route = useRoute()
const router = useRouter()

const status = ref(String(route.query['status'] ?? ''))
const q = ref(String(route.query['q'] ?? ''))
const page = ref(Number(route.query['page']) || 1)

/** Kata kunci yang dipakai query: ditunda 300 ms setelah berhenti mengetik. */
const search = ref(q.value)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(q, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    search.value = value
  }, 300)
})

// Key reaktif: berubah (site, status, kata kunci, halaman) -> data diambil ulang.
const { data, error, pending } = await useAsyncData(
  () => `articles-${site.value?.id}-${status.value}-${search.value}-${page.value}`,
  () => {
    if (!site.value) return Promise.resolve(null)
    const query: AdminArticleQuery = { page: page.value, status: status.value || undefined, q: search.value || undefined }
    return adminApi<Json<Page<ArticleListItem>>>(site.value.id, 'articles', { query })
  },
  { server: false },
)

watch([status, search, page], () => router.replace({ query: { ...(status.value && { status: status.value }), ...(search.value && { q: search.value }), ...(page.value > 1 && { page: page.value }) } }))
</script>

<template>
  <div>
    <header class="adm-head">
      <h1>Artikel</h1>
      <div class="adm-head__actions">
        <NuxtLink
          v-if="site"
          class="btn btn--primary"
          :to="`/admin/${site.code}/articles/new`"
        >
          Tulis artikel
        </NuxtLink>
      </div>
    </header>

    <div class="filters">
      <input
        v-model="q"
        type="search"
        placeholder="Cari judul"
        aria-label="Cari judul"
      >
      <select
        v-model="status"
        aria-label="Status"
        @change="page = 1"
      >
        <option value="">
          Semua status
        </option>
        <option
          v-for="s in ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED']"
          :key="s"
          :value="s"
        >
          {{ STATUS_LABELS[s] }}
        </option>
      </select>
    </div>

    <p
      v-if="error"
      class="notice notice--error"
    >
      {{ apiErrorMessage(error) }}
    </p>
    <p
      v-else-if="pending && !data"
      class="muted"
    >
      Memuat artikel…
    </p>
    <template v-else-if="data && site">
      <table
        v-if="data.items.length"
        class="table"
      >
        <thead>
          <tr>
            <th>Judul</th>
            <th>Status</th>
            <th class="hide-sm">
              Kategori
            </th>
            <th class="hide-sm">
              Terbit
            </th>
            <th>Diubah</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="a in data.items"
            :key="a.id"
          >
            <td>
              <NuxtLink
                class="table__title"
                :to="`/admin/${site.code}/articles/${a.id}`"
              >
                {{ a.title }}
              </NuxtLink>
              <div class="mono muted">
                {{ a.slug }}
              </div>
            </td>
            <td>
              <AdminStatusBadge
                :status="a.status"
                :published-at="a.publishedAt"
              />
            </td>
            <td class="hide-sm">
              {{ a.category.name }}
            </td>
            <td class="nowrap hide-sm">
              {{ formatSiteDate(a.publishedAt, site) }}
            </td>
            <td class="nowrap">
              {{ formatSiteDate(a.updatedAt, site) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-else
        class="muted"
      >
        {{ q || status ? 'Tidak ada artikel yang cocok dengan filter ini.' : 'Belum ada artikel. Mulai dengan Tulis artikel.' }}
      </p>
      <nav
        v-if="data.totalPages > 1"
        class="pager"
        aria-label="Halaman daftar"
      >
        <button
          type="button"
          class="btn btn--small"
          :disabled="page <= 1"
          @click="page--"
        >
          Sebelumnya
        </button>
        <span class="muted">Halaman {{ data.page }} dari {{ data.totalPages }} ({{ data.total }} artikel)</span>
        <button
          type="button"
          class="btn btn--small"
          :disabled="page >= data.totalPages"
          @click="page++"
        >
          Berikutnya
        </button>
      </nav>
    </template>
  </div>
</template>
