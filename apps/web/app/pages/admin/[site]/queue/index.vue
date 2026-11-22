<!--
  Antrian terbit (ADR-010, M5a 5a.3): hasil AI dari SEMUA site milik user,
  terbaru dulu. Pilih beberapa lalu "Terbitkan yang dipilih", atau buka satu
  untuk pratinjau, pemeriksaan, dan keputusan lain (jadwalkan, draft, tolak).
-->
<script setup lang="ts">
import type { GeneratedListItem, Page } from '@framework/core'

definePageMeta({ layout: 'admin' })

type Item = Json<GeneratedListItem> & { site?: { id: string; code: string; name: string } }
type QueuePage = Json<Page<GeneratedListItem>> & { items: Item[]; ready: Record<string, number> }

const me = useAdminMe()
const route = useRoute()
const router = useRouter()

const siteFilter = ref(String(route.query['site'] ?? ''))
const status = ref(String(route.query['status'] ?? 'READY_TO_PUBLISH'))
const page = ref(Number(route.query['page']) || 1)
const selected = ref<Set<string>>(new Set())
const busy = ref(false)
const report = ref<{ ok: number; failed: { title: string; message: string }[] } | null>(null)

const { data, error, pending, refresh } = await useAsyncData(
  () => `queue-${siteFilter.value}-${status.value}-${page.value}`,
  () => $fetch<QueuePage>('/api/admin/generated', { query: { status: status.value, page: page.value, ...(siteFilter.value && { siteId: siteFilter.value }) } }),
  { server: false },
)

watch([siteFilter, status, page], () => {
  selected.value = new Set()
  router.replace({ query: { ...(siteFilter.value && { site: siteFilter.value }), ...(status.value !== 'READY_TO_PUBLISH' && { status: status.value }), ...(page.value > 1 && { page: page.value }) } })
})

const ready = computed(() => status.value === 'READY_TO_PUBLISH')
const allChecked = computed(() => Boolean(data.value?.items.length) && data.value!.items.every((i) => selected.value.has(i.id)))

function toggle(id: string, on: boolean) {
  const next = new Set(selected.value)
  if (on) next.add(id)
  else next.delete(id)
  selected.value = next
}
function toggleAll(on: boolean) {
  selected.value = new Set(on ? (data.value?.items ?? []).map((i) => i.id) : [])
}

function siteOf(item: Item) {
  return me.value?.sites.find((s) => s.id === item.siteId) ?? null
}

async function publishSelected() {
  const items = (data.value?.items ?? []).filter((i) => selected.value.has(i.id))
  if (!items.length || !confirm(`Terbitkan ${items.length} hasil AI sekarang? Hasil yang punya galat tidak akan diterbitkan.`)) return
  busy.value = true
  report.value = null
  try {
    const res = await $fetch<{ results: { id: string; ok: boolean; message?: string }[] }>('/api/admin/generated/approve-bulk', {
      method: 'POST',
      body: { items: items.map((i) => ({ siteId: i.siteId, id: i.id, expectedUpdatedAt: i.updatedAt })) },
    })
    const titles = new Map(items.map((i) => [i.id, i.title ?? '(tanpa judul)']))
    report.value = {
      ok: res.results.filter((r) => r.ok).length,
      failed: res.results.filter((r) => !r.ok).map((r) => ({ title: titles.get(r.id) ?? r.id, message: r.message ?? 'gagal' })),
    }
    selected.value = new Set()
    await Promise.all([refresh(), refreshQueueCount()])
  } catch (e) {
    report.value = { ok: 0, failed: [{ title: 'Semua', message: apiErrorMessage(e) }] }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <header class="adm-head">
      <h1>Antrian terbit</h1>
      <div class="adm-head__actions">
        <button
          v-if="ready"
          type="button"
          class="btn btn--primary"
          :disabled="busy || selected.size === 0"
          @click="publishSelected"
        >
          {{ busy ? 'Menerbitkan…' : `Terbitkan yang dipilih (${selected.size})` }}
        </button>
      </div>
    </header>

    <div class="filters">
      <select
        v-model="siteFilter"
        aria-label="Site"
        @change="page = 1"
      >
        <option value="">
          Semua site
        </option>
        <option
          v-for="s in me?.sites ?? []"
          :key="s.id"
          :value="s.id"
        >
          {{ s.name }}{{ data?.ready[s.id] ? ` (${data.ready[s.id]})` : '' }}
        </option>
      </select>
      <select
        v-model="status"
        aria-label="Status"
        @change="page = 1"
      >
        <option value="READY_TO_PUBLISH">
          Menunggu keputusan
        </option>
        <option value="APPROVED">
          Disetujui
        </option>
        <option value="ARCHIVED">
          Ditolak
        </option>
      </select>
    </div>

    <div
      v-if="report"
      class="notice"
      :class="{ 'notice--error': report.failed.length }"
      role="status"
    >
      <p>{{ report.ok }} hasil AI diterbitkan.</p>
      <template v-if="report.failed.length">
        <p>{{ report.failed.length }} tidak diterbitkan. Buka satu per satu untuk melihat pemeriksaannya:</p>
        <ul>
          <li
            v-for="f in report.failed"
            :key="f.title"
          >
            <strong>{{ f.title }}</strong>: {{ f.message }}
          </li>
        </ul>
      </template>
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
      Memuat antrian…
    </p>
    <template v-else-if="data">
      <div
        v-if="data.items.length"
        class="table-scroll"
      >
        <table class="table">
          <thead>
            <tr>
              <th v-if="ready">
                <input
                  type="checkbox"
                  aria-label="Pilih semua"
                  :checked="allChecked"
                  @change="toggleAll(($event.target as HTMLInputElement).checked)"
                >
              </th>
              <th>Judul</th>
              <th>Site</th>
              <th class="hide-sm">
                Catatan agent
              </th>
              <th>{{ ready ? 'Dibuat' : 'Diputuskan' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in data.items"
              :key="item.id"
            >
              <td v-if="ready">
                <input
                  type="checkbox"
                  :aria-label="`Pilih ${item.title ?? 'hasil AI'}`"
                  :checked="selected.has(item.id)"
                  @change="toggle(item.id, ($event.target as HTMLInputElement).checked)"
                >
              </td>
              <td>
                <NuxtLink
                  v-if="siteOf(item)"
                  class="table__title"
                  :to="`/admin/${siteOf(item)!.code}/queue/${item.id}`"
                >
                  {{ item.title ?? '(tanpa judul)' }}
                </NuxtLink>
                <div class="mono muted">
                  {{ item.externalId }}
                </div>
              </td>
              <td>{{ item.site?.name ?? '-' }}</td>
              <td class="hide-sm muted">
                {{ item.agentNote ? (item.agentNote.length > 90 ? `${item.agentNote.slice(0, 90)}…` : item.agentNote) : '-' }}
              </td>
              <td class="nowrap">
                {{ siteOf(item) ? formatSiteDate(ready ? item.generatedAt : item.reviewedAt, siteOf(item)!) : '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p
        v-else
        class="muted"
      >
        {{ ready ? 'Tidak ada hasil AI yang menunggu.' : 'Belum ada.' }}
      </p>
      <nav
        v-if="data.totalPages > 1"
        class="pager"
        aria-label="Halaman"
      >
        <button
          type="button"
          class="btn btn--small"
          :disabled="page <= 1"
          @click="page--"
        >
          Sebelumnya
        </button>
        <span>{{ data.page }} / {{ data.totalPages }}</span>
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
