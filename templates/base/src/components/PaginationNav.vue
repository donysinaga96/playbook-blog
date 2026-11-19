<script setup lang="ts">
import type { PaginationView } from '@framework/template-kit'

defineProps<{ pagination: PaginationView }>()
</script>

<template>
  <nav
    v-if="pagination.totalPages > 1"
    class="pagination"
    aria-label="Halaman"
  >
    <a
      v-if="pagination.prevHref"
      class="pagination__prev"
      :href="pagination.prevHref"
      rel="prev"
    >Sebelumnya</a>
    <ol class="pagination__pages">
      <li
        v-for="(item, index) in pagination.pages"
        :key="item ? item.number : `gap-${index}`"
      >
        <span
          v-if="!item"
          class="pagination__gap"
        >…</span>
        <span
          v-else-if="item.current"
          class="pagination__current"
          aria-current="page"
        >{{ item.number }}</span>
        <a
          v-else
          :href="item.href"
        >{{ item.number }}</a>
      </li>
    </ol>
    <a
      v-if="pagination.nextHref"
      class="pagination__next"
      :href="pagination.nextHref"
      rel="next"
    >Berikutnya</a>
  </nav>
</template>
