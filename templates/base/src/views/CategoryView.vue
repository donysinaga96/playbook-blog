<script setup lang="ts">
import type { CategoryView } from '@framework/template-kit'
import ArticleList from '../components/ArticleList.vue'
import BreadcrumbNav from '../components/BreadcrumbNav.vue'
import PaginationNav from '../components/PaginationNav.vue'

defineProps<{ vm: CategoryView }>()
</script>

<template>
  <div class="view view--category listing">
    <BreadcrumbNav :items="vm.breadcrumb" />
    <header class="listing__header">
      <h1 class="listing__title">
        {{ vm.name }}
      </h1>
      <p
        v-if="vm.description"
        class="listing__description"
      >
        {{ vm.description }}
      </p>
      <ul
        v-if="vm.children.length > 0"
        class="listing__children"
        aria-label="Subkategori"
      >
        <li
          v-for="child in vm.children"
          :key="child.href"
        >
          <a :href="child.href">{{ child.label }}</a>
        </li>
      </ul>
    </header>
    <ArticleList
      :articles="vm.articles"
      empty-text="Belum ada artikel di kategori ini."
    />
    <PaginationNav :pagination="vm.pagination" />
  </div>
</template>
