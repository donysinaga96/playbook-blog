<!-- Tag: daftar dengan form di kanan; hapus melepas tag dari semua artikel. -->
<script setup lang="ts">
import type { TagRecord } from '@framework/core'

definePageMeta({ layout: 'admin' })

const site = useAdminSite()
const { data, error, refresh } = await useAsyncData(
  () => `tags-${site.value?.id}`,
  () => (site.value ? adminApi<Json<TagRecord>[]>(site.value.id, 'tags') : Promise.resolve(null)),
  { server: false },
)

const selected = ref<Json<TagRecord> | null>(null)
const form = reactive({ name: '', slug: '' })
const errors = ref<Record<string, string>>({})
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const busy = ref(false)

function edit(t: Json<TagRecord> | null) {
  selected.value = t
  errors.value = {}
  Object.assign(form, t ? { name: t.name, slug: t.slug } : { name: '', slug: '' })
}

async function save() {
  if (!site.value) return
  busy.value = true
  errors.value = {}
  message.value = null
  const tag = { name: form.name, slug: form.slug.trim() || undefined }
  try {
    const result = selected.value
      ? await adminApi<Json<TagRecord>>(site.value.id, `tags/${selected.value.id}`, { method: 'PUT', body: { tag, updatedAt: selected.value.updatedAt } })
      : await adminApi<Json<TagRecord>>(site.value.id, 'tags', { method: 'POST', body: tag })
    await refresh()
    edit(data.value?.find((t) => t.id === result.id) ?? null)
    message.value = { kind: 'ok', text: 'Tag disimpan.' }
  } catch (e) {
    errors.value = apiFieldErrors(e)
    message.value = { kind: 'error', text: apiStatus(e) === 409 ? 'Tag sudah diubah di tempat lain; pilih lagi dari daftar.' : apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!site.value || !selected.value) return
  if (!confirm(`Hapus tag ${selected.value.name}? Tag dilepas dari semua artikel.`)) return
  busy.value = true
  try {
    await adminApi(site.value.id, `tags/${selected.value.id}`, { method: 'DELETE', query: { updatedAt: selected.value.updatedAt } })
    message.value = { kind: 'ok', text: `Tag ${selected.value.name} dihapus.` }
    edit(null)
    await refresh()
  } catch (e) {
    message.value = { kind: 'error', text: apiErrorMessage(e) }
  } finally {
    busy.value = false
  }
}
const err = (field: string) => fieldError(errors.value, field)
</script>

<template>
  <div v-if="site">
    <header class="adm-head">
      <h1>Tag</h1>
      <div class="adm-head__actions">
        <button
          type="button"
          class="btn"
          @click="edit(null)"
        >
          Tag baru
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
        v-if="data?.length"
        class="table-scroll"
      >
        <table
          class="table"
        >
          <thead>
            <tr>
              <th>Nama</th>
              <th>Slug</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in data"
              :key="t.id"
              :class="{ 'is-selected': selected?.id === t.id }"
            >
              <td>
                <a
                  class="table__title"
                  href="#"
                  @click.prevent="edit(t)"
                >{{ t.name }}</a>
              </td>
              <td class="mono">
                /tag/{{ t.slug }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p
        v-else
        class="muted"
      >
        Belum ada tag.
      </p>
      <form
        class="adm-panel"
        @submit.prevent="save"
      >
        <h2>{{ selected ? `Ubah ${selected.name}` : 'Tag baru' }}</h2>
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
