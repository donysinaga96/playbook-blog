<script setup lang="ts">
import type { LinkView } from '@framework/template-kit'

defineProps<{ items: LinkView[] }>()
</script>

<template>
  <nav
    v-if="items.length > 0"
    class="breadcrumb"
    aria-label="Breadcrumb"
  >
    <ol>
      <li
        v-for="(item, index) in items"
        :key="item.href"
      >
        <a
          v-if="index < items.length - 1"
          :href="item.href"
        >{{ item.label }}</a>
        <span
          v-else
          aria-current="page"
        >{{ item.label }}</span>
      </li>
    </ol>
  </nav>
</template>
