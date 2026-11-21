<!-- Daftar halaman statis (Tentang, Kontak, ...). -->
<script setup lang="ts">
import type { PageRecord } from '@framework/core'

definePageMeta({ layout: 'admin' })

const site = useAdminSite()
const { data, error, pending } = await useAsyncData(
  () => `pages-${site.value?.id}`,
  () => (site.value ? adminApi<Json<PageRecord>[]>(site.value.id, 'pages') : Promise.resolve(null)),
  { server: false },
)
</script>

<template>
  <div v-if="site">
    <header class="adm-head">
      <h1>Halaman</h1>
      <div class="adm-head__actions">
        <NuxtLink
          class="btn btn--primary"
          :to="`/admin/${site.code}/pages/new`"
        >
          Buat halaman
        </NuxtLink>
      </div>
    </header>
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
      Memuat halaman…
    </p>
    <div
      v-else-if="data?.length"
      class="table-scroll"
    >
      <table
        class="table"
      >
        <thead>
          <tr>
            <th>Judul</th>
            <th>Status</th>
            <th>Tampilan</th>
            <th>Diubah</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in data"
            :key="p.id"
          >
            <td>
              <NuxtLink
                class="table__title"
                :to="`/admin/${site.code}/pages/${p.id}`"
              >
                {{ p.title }}
              </NuxtLink>
              <div class="mono muted">
                /p/{{ p.slug }}
              </div>
            </td>
            <td>
              <AdminStatusBadge
                :status="p.status"
                :published-at="p.publishedAt"
              />
            </td>
            <td class="mono">
              {{ p.viewKey }}
            </td>
            <td class="nowrap">
              {{ formatSiteDate(p.updatedAt, site) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p
      v-else
      class="muted"
    >
      Belum ada halaman. Halaman cocok untuk Tentang kami atau Kontak.
    </p>
  </div>
</template>
