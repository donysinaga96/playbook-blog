<script setup lang="ts">
import type { HomeView } from '@framework/template-kit'
import ArticleCard from '../components/ArticleCard.vue'
import ArticleList from '../components/ArticleList.vue'
import PaginationNav from '../components/PaginationNav.vue'
import { sectionComponents } from '../sections/components'

defineProps<{ vm: HomeView }>()

// Tipe section yang tidak punya komponen tidak dirender (core sudah
// memvalidasi layout terhadap manifest, ini hanya jaring pengaman).
function sectionComponent(type: string) {
  return Object.hasOwn(sectionComponents, type) ? sectionComponents[type as keyof typeof sectionComponents] : null
}
</script>

<template>
  <div class="view view--home">
    <template v-if="vm.sections.length > 0">
      <template
        v-for="(section, index) in vm.sections"
        :key="index"
      >
        <component
          :is="sectionComponent(section.type)"
          v-if="sectionComponent(section.type)"
          :section="section"
          :index="index"
        />
      </template>
      <PaginationNav :pagination="vm.pagination" />
    </template>
    <template v-else>
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
    </template>
  </div>
</template>
