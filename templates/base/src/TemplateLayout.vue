<!--
  Kerangka semua halaman: header, isi (slot), footer. Kelas root
  .tpl-<key> dipasang aplikasi di luar komponen ini, jadi layout tidak
  perlu tahu template mana yang aktif.
-->
<script setup lang="ts">
import type { ChromeView } from '@framework/template-kit'
import SiteFooter from './components/SiteFooter.vue'
import SiteHeader from './components/SiteHeader.vue'
import type { BaseOptions } from './config'

defineProps<{
  chrome: ChromeView
  options: BaseOptions
}>()
</script>

<template>
  <div class="layout">
    <a
      class="skip-link"
      href="#isi"
    >Lompat ke isi</a>
    <SiteHeader
      :chrome="chrome"
      :options="options"
    />
    <main
      id="isi"
      class="layout__main container"
    >
      <slot />
    </main>
    <SiteFooter :chrome="chrome" />
  </div>
</template>
