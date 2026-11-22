<!--
  Sumber dan referensi artikel (ADR-010), sesuai urutan. Tautan keluar
  dibuka di tab baru dan tidak meneruskan peringkat (nofollow).
-->
<script setup lang="ts">
import type { ReferenceView } from '@framework/template-kit'

defineProps<{ items: ReferenceView[] }>()

const KIND_LABEL: Record<ReferenceView['kind'], string | null> = { ARTICLE: null, VIDEO: 'Video', IMAGE: 'Gambar', OTHER: null }
</script>

<template>
  <section
    class="article__references"
    aria-labelledby="sumber-referensi"
  >
    <h2 id="sumber-referensi">
      Sumber dan referensi
    </h2>
    <ol>
      <li
        v-for="(r, i) in items"
        :key="i"
      >
        <a
          :href="r.url"
          target="_blank"
          rel="noopener noreferrer nofollow"
        >{{ r.title }}</a>
        <span
          v-if="r.publisher || KIND_LABEL[r.kind]"
          class="article__reference-meta"
        >
          {{ [r.publisher, KIND_LABEL[r.kind]].filter(Boolean).join(' · ') }}
        </span>
      </li>
    </ol>
  </section>
</template>
