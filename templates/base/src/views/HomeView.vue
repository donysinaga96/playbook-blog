<script setup lang="ts">
import type { HomeView } from '@framework/template-kit'
import ArticleCard from '../components/ArticleCard.vue'
import ArticleList from '../components/ArticleList.vue'
import PaginationNav from '../components/PaginationNav.vue'

defineProps<{ vm: HomeView }>()
</script>

<template>
  <div class="view view--home">
    <section
      v-if="vm.featured.length > 0"
      class="home__featured"
      aria-label="Pilihan redaksi"
    >
      <ArticleCard
        v-for="(article, index) in vm.featured"
        :key="article.href"
        :article="article"
        :lead="index === 0"
      />
    </section>
    <section
      class="home__latest"
      aria-labelledby="judul-terbaru"
    >
      <h2
        id="judul-terbaru"
        class="section-title"
      >
        Terbaru
      </h2>
      <ArticleList :articles="vm.latest" />
      <PaginationNav :pagination="vm.pagination" />
    </section>
  </div>
</template>
