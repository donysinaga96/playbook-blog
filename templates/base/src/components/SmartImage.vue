<!--
  Satu-satunya cara template menampilkan gambar. Bila `ratio` diisi, gambar
  dipotong ke rasio itu dengan titik fokus media sebagai pusat, jadi wajah
  atau objek utama tidak terpotong. Tanpa `ratio`, gambar tampil utuh.
-->
<script setup lang="ts">
import type { ImageView } from '@framework/template-kit'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  image: ImageView
  /** Rasio tampilan, mis. "16/9", "4/3", "1/1". */
  ratio?: string
  /** "eager" untuk gambar utama di atas layar; sisanya lazy. */
  loading?: 'lazy' | 'eager'
  sizes?: string
}>(), {
  ratio: undefined,
  loading: 'lazy',
  sizes: undefined,
})

const RATIO = /^\d+(\.\d+)?\/\d+(\.\d+)?$/

const style = computed(() => {
  const percent = (v: number) => `${Math.round(Math.min(Math.max(v, 0), 1) * 1000) / 10}%`
  if (!props.ratio || !RATIO.test(props.ratio)) return undefined
  return {
    aspectRatio: props.ratio,
    objectFit: 'cover' as const,
    objectPosition: `${percent(props.image.focalX)} ${percent(props.image.focalY)}`,
  }
})
</script>

<template>
  <img
    class="smart-image"
    :src="image.src"
    :alt="image.alt"
    :width="image.width ?? undefined"
    :height="image.height ?? undefined"
    :loading="loading"
    :fetchpriority="loading === 'eager' ? 'high' : undefined"
    decoding="async"
    :sizes="sizes"
    :style="style"
  >
</template>
