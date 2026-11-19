<script setup lang="ts">
import type { ChromeView } from '@framework/template-kit'
import type { BaseOptions } from '../config'
import MenuTree from './MenuTree.vue'
import SmartImage from './SmartImage.vue'

defineProps<{
  chrome: ChromeView
  options: BaseOptions
}>()
</script>

<template>
  <header
    class="site-header"
    :class="`site-header--${options.header.style}`"
  >
    <div class="site-header__inner container">
      <p
        v-if="options.header.showDate"
        class="site-header__date"
      >
        <time :datetime="chrome.today.iso">{{ chrome.today.label }}</time>
      </p>
      <a
        class="site-header__brand"
        :href="chrome.site.homeHref"
        rel="home"
      >
        <SmartImage
          v-if="chrome.site.logo"
          class="site-header__logo"
          :image="{ ...chrome.site.logo, alt: chrome.site.name }"
          loading="eager"
        />
        <span
          v-else
          class="site-header__name"
        >{{ chrome.site.name }}</span>
      </a>
      <p
        v-if="chrome.site.tagline"
        class="site-header__tagline"
      >
        {{ chrome.site.tagline }}
      </p>
    </div>
    <nav
      v-if="(chrome.menus['header'] ?? []).length > 0"
      class="site-header__nav"
      aria-label="Menu utama"
    >
      <div class="container">
        <MenuTree :items="chrome.menus['header'] ?? []" />
      </div>
    </nav>
  </header>
</template>
