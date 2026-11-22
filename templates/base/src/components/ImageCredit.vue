<!--
  Kredit gambar (ADR-010): pemilik hak dan, bila diambil dari sumber lain,
  tautan ke halaman asalnya. Tanpa kredit tetapi ada sumber: "Sumber gambar".
-->
<script setup lang="ts">
import type { ImageView } from '@framework/template-kit'

defineProps<{ image: ImageView }>()
</script>

<template>
  <span
    v-if="image.credit || image.sourceUrl"
    class="prose__credit"
  >
    <a
      v-if="image.sourceUrl"
      :href="image.sourceUrl"
      target="_blank"
      rel="noopener noreferrer nofollow"
    >{{ image.credit ?? 'Sumber gambar' }}</a>
    <template v-else>{{ image.credit }}</template>
  </span>
</template>
