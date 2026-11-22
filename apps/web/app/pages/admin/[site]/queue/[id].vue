<!--
  Satu hasil AI (ADR-010, M5a 5a.3): pemeriksaan (galat memblokir,
  peringatan hanya ditampilkan), pratinjau dengan template site, referensi,
  lalu keputusan: terbitkan sekarang, jadwalkan, pindahkan sebagai draft,
  atau tolak dengan alasan. Setiap keputusan membawa updatedAt yang sedang
  ditampilkan; bila agent sudah memperbaruinya, server menolak (409).
-->
<script setup lang="ts">
import type { ArticleRecord, GeneratedRecord, ReviewIssue } from '@framework/core'

definePageMeta({ layout: 'admin' })

interface Detail {
  record: Json<GeneratedRecord>
  issues: ReviewIssue[]
  canApprove: boolean
  previewPath: string
}
interface PayloadView {
  excerpt: string | null
  category: string | null
  tags: string[]
  references: { title: string; url: string; publisher?: string; kind?: string }[]
}

const site = useAdminSite()
const route = useRoute()
const id = computed(() => String(route.params['id']))

const { data, error, pending, refresh } = await useAsyncData(
  () => `generated-${site.value?.id}-${id.value}`,
  () => (site.value ? adminApi<Detail>(site.value.id, `generated/${id.value}`) : Promise.resolve(null)),
  { server: false },
)

const record = computed(() => data.value?.record ?? null)
const ready = computed(() => record.value?.status === 'READY_TO_PUBLISH')
const errorsList = computed(() => (data.value?.issues ?? []).filter((i) => i.level === 'error'))
const warningsList = computed(() => (data.value?.issues ?? []).filter((i) => i.level === 'warning'))

/** Bagian payload yang ditampilkan; dibaca longgar karena payload bisa rusak. */
const payload = computed<PayloadView>(() => {
  const p = (record.value?.payload ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  const refs = Array.isArray(p['references']) ? p['references'] : []
  return {
    excerpt: str(p['excerpt']),
    category: str(p['category']),
    tags: Array.isArray(p['tags']) ? p['tags'].filter((t): t is string => typeof t === 'string') : [],
    // Payload mentah dari agent (belum tentu lolos skema): hanya URL http(s) yang
    // boleh menjadi href, agar `javascript:` dari agent tidak bisa dijalankan di origin admin.
    references: refs.filter((r): r is PayloadView['references'][number] =>
      typeof r === 'object' && r !== null && typeof (r as { url?: unknown }).url === 'string' && /^https?:\/\//i.test((r as { url: string }).url)),
  }
})

const scheduleLocal = ref('')
const note = ref('')
const rejectNote = ref('')
const busy = ref(false)
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const result = ref<Json<ArticleRecord> | null>(null)
const conflict = ref(false)

async function decide(path: 'approve' | 'reject', body: Record<string, unknown>, done: string) {
  if (!site.value || !record.value) return
  busy.value = true
  message.value = null
  conflict.value = false
  try {
    const res = await adminApi<{ article?: Json<ArticleRecord> }>(site.value.id, `generated/${id.value}/${path}`, {
      method: 'POST',
      body: { ...body, expectedUpdatedAt: record.value.updatedAt },
    })
    result.value = res.article ?? null
    message.value = { kind: 'ok', text: done }
    await Promise.all([refresh(), refreshQueueCount()])
  } catch (e) {
    conflict.value = apiStatus(e) === 409
    const fields = apiFieldErrors(e)
    const detail = Object.entries(fields).map(([f, m]) => (f ? `${f}: ${m}` : m)).join('; ')
    message.value = { kind: 'error', text: detail || apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}

function publishNow() {
  if (confirm('Terbitkan sekarang? Artikel langsung tampil di site.')) {
    void decide('approve', { mode: 'publish', note: note.value || undefined }, 'Diterbitkan.')
  }
}
function schedule() {
  const iso = site.value ? zonedInputToIso(scheduleLocal.value, site.value.timezone) : null
  if (!iso) {
    message.value = { kind: 'error', text: 'Isi tanggal dan jam terbit.' }
    return
  }
  void decide('approve', { mode: 'schedule', publishAt: iso, note: note.value || undefined }, 'Dijadwalkan.')
}
function toDraft() {
  void decide('approve', { mode: 'draft', note: note.value || undefined }, 'Dipindahkan sebagai draft. Lanjutkan di editor artikel.')
}
function reject() {
  if (!rejectNote.value.trim()) {
    message.value = { kind: 'error', text: 'Alasan penolakan wajib diisi.' }
    return
  }
  void decide('reject', { note: rejectNote.value }, 'Ditolak dan diarsipkan.')
}
</script>

<template>
  <div>
    <p>
      <NuxtLink
        v-if="site"
        :to="`/admin/${site.code}/queue`"
      >
        ← Antrian terbit
      </NuxtLink>
    </p>

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
      Memuat hasil AI…
    </p>

    <template v-else-if="data && record && site">
      <header class="adm-head">
        <h1>{{ (record.payload as { title?: unknown })?.title ?? '(tanpa judul)' }}</h1>
        <AdminStatusBadge :status="record.status" />
      </header>
      <p class="muted">
        {{ site.name }} · <span class="mono">{{ record.externalId }}</span> · dibuat {{ formatSiteDate(record.generatedAt, site) }}
      </p>

      <div
        v-if="message"
        class="notice"
        :class="{ 'notice--error': message.kind === 'error' }"
        role="status"
      >
        {{ message.text }}
        <button
          v-if="conflict"
          type="button"
          class="btn btn--small"
          @click="refresh()"
        >
          Muat ulang
        </button>
        <NuxtLink
          v-if="result"
          :to="`/admin/${site.code}/articles/${result.id}`"
        >
          Buka artikel
        </NuxtLink>
      </div>

      <div class="adm-editor">
        <div class="stack">
          <section class="adm-panel">
            <h2>Pemeriksaan</h2>
            <p
              v-if="!errorsList.length && !warningsList.length"
              class="muted"
            >
              Tidak ada masalah.
            </p>
            <ul class="issues">
              <li
                v-for="(i, n) in errorsList"
                :key="`e${n}`"
                class="issues__error"
              >
                <strong>Galat</strong><span v-if="i.field"> · <span class="mono">{{ i.field }}</span></span>: {{ i.message }}
              </li>
              <li
                v-for="(i, n) in warningsList"
                :key="`w${n}`"
                class="issues__warning"
              >
                <strong>Peringatan</strong><span v-if="i.field"> · <span class="mono">{{ i.field }}</span></span>: {{ i.message }}
              </li>
            </ul>
          </section>

          <section class="adm-panel">
            <h2>Pratinjau</h2>
            <iframe
              v-if="errorsList.length === 0 || !ready"
              :src="data.previewPath"
              title="Pratinjau hasil AI dengan template site"
              class="preview-frame"
              loading="lazy"
            />
            <p
              v-else
              class="muted"
            >
              Pratinjau tersedia setelah galat diperbaiki.
            </p>
          </section>
        </div>

        <aside class="stack">
          <section
            v-if="ready"
            class="adm-panel stack"
          >
            <h2>Keputusan</h2>
            <label class="field">
              <span>Catatan (opsional)</span>
              <input
                v-model="note"
                type="text"
              >
            </label>
            <button
              type="button"
              class="btn btn--primary"
              :disabled="busy || !data.canApprove"
              @click="publishNow"
            >
              Terbitkan sekarang
            </button>
            <div class="row">
              <input
                v-model="scheduleLocal"
                type="datetime-local"
                aria-label="Tanggal dan jam terbit"
              >
              <button
                type="button"
                class="btn"
                :disabled="busy || !data.canApprove"
                @click="schedule"
              >
                Jadwalkan
              </button>
            </div>
            <span class="field__hint">Zona waktu {{ site.timezone }}</span>
            <button
              type="button"
              class="btn"
              :disabled="busy || !data.canApprove"
              @click="toDraft"
            >
              Pindahkan sebagai draft
            </button>
            <p
              v-if="!data.canApprove"
              class="field__hint"
            >
              Masih ada galat: hasil ini hanya bisa ditolak.
            </p>
            <label class="field">
              <span>Alasan penolakan</span>
              <textarea
                v-model="rejectNote"
                rows="3"
                maxlength="1000"
              />
            </label>
            <button
              type="button"
              class="btn btn--danger"
              :disabled="busy"
              @click="reject"
            >
              Tolak
            </button>
          </section>
          <section
            v-else
            class="adm-panel"
          >
            <h2>Keputusan</h2>
            <p>
              {{ record.status === 'APPROVED' ? 'Disetujui' : 'Ditolak' }}
              {{ record.reviewedAt ? formatSiteDate(record.reviewedAt, site) : '' }}
            </p>
            <p v-if="record.reviewNote">
              {{ record.reviewNote }}
            </p>
            <NuxtLink
              v-if="record.articleId"
              :to="`/admin/${site.code}/articles/${record.articleId}`"
            >
              Buka artikel
            </NuxtLink>
          </section>

          <section
            v-if="record.agentNote"
            class="adm-panel"
          >
            <h2>Catatan agent</h2>
            <p>{{ record.agentNote }}</p>
          </section>

          <section class="adm-panel">
            <h2>Isi</h2>
            <p v-if="payload.excerpt">
              {{ payload.excerpt }}
            </p>
            <p class="muted">
              Kategori: <span class="mono">{{ payload.category ?? '-' }}</span>
            </p>
            <p
              v-if="payload.tags.length"
              class="muted"
            >
              Tag: {{ payload.tags.join(', ') }}
            </p>
          </section>

          <section class="adm-panel">
            <h2>Referensi ({{ payload.references.length }})</h2>
            <ol v-if="payload.references.length">
              <li
                v-for="r in payload.references"
                :key="r.url"
              >
                <a
                  :href="r.url"
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                >{{ r.title }}</a>
                <span
                  v-if="r.publisher"
                  class="muted"
                > · {{ r.publisher }}</span>
              </li>
            </ol>
            <p
              v-else
              class="muted"
            >
              Tidak ada referensi.
            </p>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.preview-frame {
  width: 100%;
  height: 70vh;
  border: 1px solid var(--line, #e3e5e3);
  border-radius: 6px;
  background: #fff;
}
</style>
