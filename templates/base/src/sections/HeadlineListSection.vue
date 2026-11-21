<script setup lang="ts">
import type { SectionView } from '@framework/template-kit'
import { computed } from 'vue'
import SectionHeading from './SectionHeading.vue'
import { textProp } from './props'

// Daftar judul tanpa gambar: kategori, judul, tanggal.
const props = defineProps<{ section: SectionView; index: number }>()
const title = computed(() => textProp(props.section, 'title') ?? (textProp(props.section, 'source') === 'featured' ? 'Pilihan redaksi' : 'Terbaru'))
</script>

<template>
  <section
    v-if="section.articles.length > 0"
    class="section section--headline-list"
    :aria-labelledby="`section-${index}-title`"
  >
    <SectionHeading
      :id="`section-${index}-title`"
      :text="title"
      :link="section.link"
    />
    <ul class="headline-list">
      <li
        v-for="article in section.articles"
        :key="article.href"
        class="headline-list__item"
      >
        <a
          class="headline-list__category"
          :href="article.category.href"
        >{{ article.category.label }}</a>
        <a
          class="headline-list__title"
          :href="article.href"
        >{{ article.title }}</a>
        <time
          class="headline-list__date"
          :datetime="article.publishedAt.iso"
        >{{ article.publishedAt.label }}</time>
      </li>
    </ul>
  </section>
</template>
