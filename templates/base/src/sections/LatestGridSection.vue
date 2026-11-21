<script setup lang="ts">
import type { SectionView } from '@framework/template-kit'
import ArticleList from '../components/ArticleList.vue'
import { computed } from 'vue'
import SectionHeading from './SectionHeading.vue'
import { textProp } from './props'

const props = defineProps<{ section: SectionView; index: number }>()
const title = computed(() => textProp(props.section, 'title') ?? 'Terbaru')
</script>

<template>
  <section
    class="section section--latest-grid"
    :aria-labelledby="`section-${index}-title`"
  >
    <SectionHeading
      :id="`section-${index}-title`"
      :text="title"
      :link="section.link"
    />
    <ArticleList :articles="section.articles" />
  </section>
</template>
