<script setup lang="ts">
import type { ArticleCardView } from '@framework/template-kit'
import ArticleCard from './ArticleCard.vue'

withDefaults(defineProps<{
  articles: ArticleCardView[]
  /** Teks saat daftar kosong. */
  emptyText?: string
}>(), { emptyText: 'Belum ada artikel.' })
</script>

<template>
  <div
    v-if="articles.length > 0"
    class="article-list"
  >
    <ArticleCard
      v-for="article in articles"
      :key="article.href"
      :article="article"
    />
  </div>
  <p
    v-else
    class="article-list__empty"
  >
    {{ emptyText }}
  </p>
</template>
