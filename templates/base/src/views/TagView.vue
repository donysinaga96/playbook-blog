<script setup lang="ts">
import type { TagView } from '@framework/template-kit'
import ArticleList from '../components/ArticleList.vue'
import PaginationNav from '../components/PaginationNav.vue'

defineProps<{ vm: TagView }>()
</script>

<template>
  <div class="view view--tag listing">
    <header class="listing__header">
      <p class="listing__kicker">
        Tag
      </p>
      <h1 class="listing__title">
        {{ vm.name }}
      </h1>
    </header>
    <ArticleList
      :articles="vm.articles"
      empty-text="Belum ada artikel dengan tag ini."
    />
    <PaginationNav :pagination="vm.pagination" />
  </div>
</template>
