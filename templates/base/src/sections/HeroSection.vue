<script setup lang="ts">
import type { SectionView } from '@framework/template-kit'
import { computed } from 'vue'
import ArticleCard from '../components/ArticleCard.vue'
import { textProp } from './props'

// Artikel utama: kartu pertama besar, sisanya (bila limit > 1) biasa.
const props = defineProps<{ section: SectionView; index: number }>()
const label = computed(() => (textProp(props.section, 'source') === 'latest' ? 'Artikel terbaru' : 'Pilihan redaksi'))
</script>

<template>
  <section
    v-if="section.articles.length > 0"
    class="section section--hero"
    :aria-label="label"
  >
    <ArticleCard
      v-for="(article, i) in section.articles"
      :key="article.href"
      :article="article"
      :lead="i === 0"
    />
  </section>
</template>
