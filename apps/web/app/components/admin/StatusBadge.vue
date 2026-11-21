<!-- Status konten; PUBLISHED dengan tanggal di masa depan tampil "Terjadwal". -->
<script setup lang="ts">
const props = defineProps<{ status: string; publishedAt?: string | null }>()
const shown = computed(() => displayStatus(props.status, props.publishedAt ?? null))
</script>

<template>
  <span
    class="status"
    :class="`status--${shown.key}`"
  >{{ shown.label }}</span>
</template>
