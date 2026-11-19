<script setup lang="ts">
import type { PageView } from '@framework/template-kit'
import BlockRenderer from '../components/BlockRenderer.vue'

defineProps<{ vm: PageView }>()
</script>

<template>
  <article
    class="view view--page page"
    :class="`page--${vm.viewKey}`"
  >
    <h1 class="page__title">
      {{ vm.title }}
    </h1>
    <BlockRenderer :blocks="vm.blocks" />
  </article>
</template>
