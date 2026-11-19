<script setup lang="ts">
import type { AuthorView } from '@framework/template-kit'
import ArticleList from '../components/ArticleList.vue'
import PaginationNav from '../components/PaginationNav.vue'
import SmartImage from '../components/SmartImage.vue'

defineProps<{ vm: AuthorView }>()
</script>

<template>
  <div class="view view--author listing">
    <header class="listing__header author">
      <SmartImage
        v-if="vm.avatar"
        class="author__avatar"
        :image="vm.avatar"
        ratio="1/1"
        loading="eager"
      />
      <div>
        <p class="listing__kicker">
          Penulis
        </p>
        <h1 class="listing__title">
          {{ vm.name }}
        </h1>
        <p
          v-if="vm.bio"
          class="listing__description"
        >
          {{ vm.bio }}
        </p>
      </div>
    </header>
    <ArticleList
      :articles="vm.articles"
      empty-text="Penulis ini belum punya artikel."
    />
    <PaginationNav :pagination="vm.pagination" />
  </div>
</template>
