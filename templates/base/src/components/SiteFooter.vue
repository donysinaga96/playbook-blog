<script setup lang="ts">
import type { ChromeView } from '@framework/template-kit'
import MenuTree from './MenuTree.vue'

defineProps<{ chrome: ChromeView }>()
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__inner container">
      <nav
        v-if="(chrome.menus['footer'] ?? []).length > 0"
        class="site-footer__nav"
        aria-label="Menu footer"
      >
        <MenuTree :items="chrome.menus['footer'] ?? []" />
      </nav>
      <p class="site-footer__copy">
        {{ chrome.site.name }}
      </p>
    </div>
  </footer>
</template>
