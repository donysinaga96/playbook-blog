<script setup lang="ts">
import type { LinkView } from '@framework/template-kit'

// Judul section: teks biasa, atau tautan bila section punya kategori/tag.
defineProps<{
  id: string
  text: string
  link: LinkView | null
}>()
</script>

<template>
  <div class="section__head">
    <h2
      :id="id"
      class="section-title section__title"
    >
      <a
        v-if="link"
        :href="link.href"
      >{{ text }}</a>
      <template v-else>
        {{ text }}
      </template>
    </h2>
    <a
      v-if="link"
      class="section__more"
      :href="link.href"
    >Lihat semua</a>
  </div>
</template>
