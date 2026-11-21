<script setup lang="ts">
import type { SectionView } from '@framework/template-kit'
import ArticleCard from '../components/ArticleCard.vue'
import { computed } from 'vue'
import SectionHeading from './SectionHeading.vue'
import { textProp } from './props'

// Deret kartu satu kategori; judul dan "Lihat semua" menuju halaman kategori.
const props = defineProps<{ section: SectionView; index: number }>()
const title = computed(() => textProp(props.section, 'title') ?? props.section.link?.label ?? 'Kategori')
</script>

<template>
  <section
    v-if="section.articles.length > 0"
    class="section section--category-strip"
    :aria-labelledby="`section-${index}-title`"
  >
    <SectionHeading
      :id="`section-${index}-title`"
      :text="title"
      :link="section.link"
    />
    <div class="article-list category-strip__list">
      <ArticleCard
        v-for="article in section.articles"
        :key="article.href"
        :article="article"
      />
    </div>
  </section>
</template>
