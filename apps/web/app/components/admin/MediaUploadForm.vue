<!-- Form unggah satu gambar: file + teks alternatif (wajib) + keterangan. -->
<script setup lang="ts">
import type { MediaListItem } from '@framework/core'

const props = defineProps<{ siteId: string }>()
const emit = defineEmits<{ uploaded: [media: Json<MediaListItem>] }>()

const file = ref<File | null>(null)
const altText = ref('')
const caption = ref('')
const credit = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const errors = ref<Record<string, string>>({})
const input = ref<HTMLInputElement | null>(null)

async function submit() {
  if (!file.value) {
    errors.value = { file: 'Pilih file gambar' }
    return
  }
  busy.value = true
  error.value = null
  errors.value = {}
  try {
    const media = await uploadMedia(props.siteId, file.value, { altText: altText.value, caption: caption.value, credit: credit.value })
    emit('uploaded', media)
    file.value = null
    altText.value = caption.value = credit.value = ''
    if (input.value) input.value.value = ''
  } catch (e) {
    errors.value = apiFieldErrors(e)
    error.value = e instanceof Error && !apiStatus(e) ? e.message : apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form
    class="stack"
    @submit.prevent="submit"
  >
    <label class="field">
      <span>File gambar</span>
      <input
        ref="input"
        type="file"
        :accept="UPLOAD_ACCEPT"
        :aria-invalid="!!errors.file || undefined"
        @change="file = ($event.target as HTMLInputElement).files?.[0] ?? null"
      >
      <span class="field__hint">JPEG, PNG, atau WebP, maksimal {{ UPLOAD_MAX_MB }} MB.</span>
      <span
        v-if="errors.file"
        class="field__error"
      >{{ errors.file }}</span>
    </label>
    <label class="field">
      <span>Teks alternatif</span>
      <input
        v-model="altText"
        type="text"
        placeholder="Apa yang terlihat di gambar"
        :aria-invalid="!!errors.altText || undefined"
      >
      <span
        v-if="errors.altText"
        class="field__error"
      >{{ errors.altText }}</span>
      <span
        v-else
        class="field__hint"
      >Dibacakan pembaca layar dan tampil bila gambar gagal dimuat.</span>
    </label>
    <div class="row">
      <label class="field">
        <span>Keterangan</span>
        <input
          v-model="caption"
          type="text"
          placeholder="Opsional"
        >
      </label>
      <label class="field">
        <span>Kredit</span>
        <input
          v-model="credit"
          type="text"
          placeholder="Mis. Foto: Redaksi"
        >
      </label>
    </div>
    <p
      v-if="error"
      class="field__error"
      role="alert"
    >
      {{ error }}
    </p>
    <div>
      <button
        type="submit"
        class="btn btn--primary"
        :disabled="busy"
      >
        {{ busy ? 'Mengunggah…' : 'Unggah' }}
      </button>
    </div>
  </form>
</template>
