<script setup lang="ts">
import type { ArticleView } from '@framework/template-kit'
import BlockRenderer from '../components/BlockRenderer.vue'
import ArticleReferences from '../components/ArticleReferences.vue'
import BreadcrumbNav from '../components/BreadcrumbNav.vue'
import ImageCredit from '../components/ImageCredit.vue'
import SmartImage from '../components/SmartImage.vue'

defineProps<{ vm: ArticleView }>()
</script>

<template>
  <article
    class="view view--article article"
    :class="`article--${vm.format}`"
  >
    <BreadcrumbNav :items="vm.breadcrumb" />
    <header class="article__header">
      <a
        class="article__category"
        :href="vm.category.href"
      >{{ vm.category.label }}</a>
      <h1 class="article__title">
        {{ vm.title }}
      </h1>
      <p
        v-if="vm.excerpt"
        class="article__excerpt"
      >
        {{ vm.excerpt }}
      </p>
      <p class="article__meta">
        <a
          v-if="vm.author"
          class="article__author"
          :href="vm.author.href"
          rel="author"
        >{{ vm.author.label }}</a>
        <time :datetime="vm.publishedAt.iso">{{ vm.publishedAt.label }}</time>
        <span
          v-if="vm.updatedAt"
          class="article__updated"
        >Diperbarui <time :datetime="vm.updatedAt.iso">{{ vm.updatedAt.label }}</time></span>
      </p>
    </header>
    <figure
      v-if="vm.image"
      class="article__image"
    >
      <SmartImage
        :image="vm.image"
        ratio="16/9"
        loading="eager"
      />
      <figcaption v-if="vm.image.caption || vm.image.credit || vm.image.sourceUrl">
        {{ vm.image.caption }}
        <ImageCredit :image="vm.image" />
      </figcaption>
    </figure>
    <BlockRenderer :blocks="vm.blocks" />
    <ArticleReferences
      v-if="vm.references.length > 0"
      :items="vm.references"
    />
    <footer
      v-if="vm.tags.length > 0"
      class="article__tags"
    >
      <ul aria-label="Tag">
        <li
          v-for="tag in vm.tags"
          :key="tag.href"
        >
          <a
            :href="tag.href"
            rel="tag"
          >{{ tag.label }}</a>
        </li>
      </ul>
    </footer>
  </article>
</template>
