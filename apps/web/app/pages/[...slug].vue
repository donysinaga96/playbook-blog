<!--
  Halaman publik, semua path selain /admin (ADR-007, ADR-009): wrapper kelas root template
  (.tpl .tpl-<key>), token sebagai CSS variable di <head>, layout template,
  lalu view untuk jenis halaman ini. Semua data datang dari state yang diisi
  di server; tautan berupa <a href> biasa, tanpa navigasi sisi klien.
-->
<script setup lang="ts">
import type { BaseOptions } from '@framework/template-base'
import { templateRegistry } from '../templates'

const theme = useSiteTheme()
const page = usePageState()

const template = computed(() => templateRegistry.get(theme.value?.templateKey ?? templateRegistry.fallback.key))
const Layout = computed(() => defineAsyncComponent(template.value.layout))
const View = computed(() => (page.value ? defineAsyncComponent(template.value.views[page.value.vm.view]) : null))
const options = computed(() => (theme.value?.options ?? template.value.options.defaults) as BaseOptions)

// Metadata <head> dibangun core (page.seo); di sini hanya dipasang.
const seo = computed(() => page.value?.seo ?? null)
useSeoMeta({
  title: () => seo.value?.title ?? 'Tidak ditemukan',
  description: () => seo.value?.description ?? undefined,
  robots: () => seo.value?.robots ?? undefined,
  ogType: () => seo.value?.og.type,
  ogTitle: () => seo.value?.og.title,
  ogDescription: () => seo.value?.og.description ?? undefined,
  ogUrl: () => seo.value?.og.url ?? undefined,
  ogSiteName: () => seo.value?.og.siteName,
  ogLocale: () => seo.value?.og.locale,
  ogImage: () => seo.value?.og.image
    ? { url: seo.value.og.image.url, alt: seo.value.og.image.alt, width: seo.value.og.image.width ?? undefined, height: seo.value.og.image.height ?? undefined }
    : undefined,
  twitterCard: () => (seo.value?.og.image ? 'summary_large_image' : 'summary'),
  articlePublishedTime: () => seo.value?.article?.publishedTime,
  articleModifiedTime: () => seo.value?.article?.modifiedTime,
  articleSection: () => seo.value?.article?.section,
  articleTag: () => seo.value?.article?.tags,
})

const links = computed(() => {
  const out: (
    | { rel: 'canonical'; href: string }
    | { rel: 'alternate'; type: 'application/rss+xml'; title: string; href: string }
    | { rel: 'icon'; href: string }
  )[] = []
  const meta = seo.value
  if (!meta) return out
  if (meta.canonical) out.push({ rel: 'canonical', href: meta.canonical })
  out.push({ rel: 'alternate', type: 'application/rss+xml', title: meta.og.siteName, href: meta.feedUrl })
  if (meta.favicon) out.push({ rel: 'icon', href: meta.favicon })
  return out
})

useHead(() => ({
  htmlAttrs: { lang: page.value?.chrome.site.locale ?? 'id' },
  link: links.value,
  style: theme.value ? [{ key: 'theme-tokens', textContent: theme.value.css }] : [],
}))
</script>

<template>
  <div
    v-if="page"
    class="tpl"
    :class="theme?.rootClass"
  >
    <component
      :is="Layout"
      :chrome="page.chrome"
      :options="options"
    >
      <component
        :is="View"
        :vm="page.vm"
      />
    </component>
  </div>
  <p v-else>
    Tidak ditemukan.
  </p>
</template>
