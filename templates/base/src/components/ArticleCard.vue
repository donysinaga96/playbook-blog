<script setup lang="ts">
import type { ArticleCardView } from '@framework/template-kit'
import SmartImage from './SmartImage.vue'

withDefaults(defineProps<{
  article: ArticleCardView
  /** Kartu utama (lebih besar, gambar dimuat segera). */
  lead?: boolean
}>(), { lead: false })
</script>

<template>
  <article
    class="article-card"
    :class="{ 'article-card--lead': lead, 'article-card--featured': article.isFeatured, [`article-card--${article.format}`]: true }"
  >
    <a
      v-if="article.image"
      class="article-card__media"
      :href="article.href"
      tabindex="-1"
      aria-hidden="true"
    >
      <SmartImage
        :image="article.image"
        ratio="16/9"
        :loading="lead ? 'eager' : 'lazy'"
      />
    </a>
    <div class="article-card__body">
      <a
        class="article-card__category"
        :href="article.category.href"
      >{{ article.category.label }}</a>
      <h3 class="article-card__title">
        <a :href="article.href">{{ article.title }}</a>
      </h3>
      <p
        v-if="article.excerpt"
        class="article-card__excerpt"
      >
        {{ article.excerpt }}
      </p>
      <p class="article-card__meta">
        <a
          v-if="article.author"
          class="article-card__author"
          :href="article.author.href"
        >{{ article.author.label }}</a>
        <time :datetime="article.publishedAt.iso">{{ article.publishedAt.label }}</time>
      </p>
    </div>
  </article>
</template>
