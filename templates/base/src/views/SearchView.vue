<script setup lang="ts">
import type { SearchView } from '@framework/template-kit'
import ArticleList from '../components/ArticleList.vue'
import PaginationNav from '../components/PaginationNav.vue'

defineProps<{ vm: SearchView }>()
</script>

<template>
  <div class="view view--search listing">
    <header class="listing__header">
      <h1 class="listing__title">
        Cari
      </h1>
      <form
        class="search-form"
        role="search"
        method="get"
        :action="vm.action"
      >
        <label
          class="visually-hidden"
          for="kata-kunci"
        >Kata kunci</label>
        <input
          id="kata-kunci"
          type="search"
          name="q"
          :value="vm.query"
          maxlength="200"
        >
        <button type="submit">
          Cari
        </button>
      </form>
    </header>
    <template v-if="vm.query">
      <p class="search__summary">
        Hasil untuk “{{ vm.query }}”
      </p>
      <ArticleList
        :articles="vm.articles"
        empty-text="Tidak ada artikel yang cocok."
      />
      <PaginationNav :pagination="vm.pagination" />
    </template>
  </div>
</template>
