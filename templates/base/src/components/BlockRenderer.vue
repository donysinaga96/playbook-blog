<!--
  Isi artikel/halaman (block body v1). Teks selalu polos dan dirender lewat
  interpolasi Vue (di-escape), tidak pernah v-html.

  Embed: iframe hanya dari `embedSrc` yang dibangun core (domain dikenal,
  bukan HTML penulis), dengan sandbox. Tanpa embedSrc (mis. X) tampil
  sebagai tautan keluar.

  Tipe block yang tidak dikenal tidak cocok dengan cabang mana pun, jadi
  tidak merender apa-apa. Core sudah membuangnya dan mencatatnya ke log.
-->
<script setup lang="ts">
import type { BlockView } from '@framework/template-kit'
import ImageCredit from './ImageCredit.vue'
import SmartImage from './SmartImage.vue'

defineProps<{ blocks: BlockView[] }>()

const PROVIDER_LABEL: Record<Extract<BlockView, { type: 'embed' }>['provider'], string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  x: 'X',
}
</script>

<template>
  <div class="prose">
    <template
      v-for="(block, index) in blocks"
      :key="index"
    >
      <p v-if="block.type === 'paragraph'">
        {{ block.text }}
      </p>
      <component
        :is="`h${block.level}`"
        v-else-if="block.type === 'heading'"
      >
        {{ block.text }}
      </component>
      <figure
        v-else-if="block.type === 'image'"
        class="prose__figure"
      >
        <SmartImage :image="block.image" />
        <figcaption v-if="block.caption || block.image.credit || block.image.sourceUrl">
          {{ block.caption }}
          <ImageCredit :image="block.image" />
        </figcaption>
      </figure>
      <blockquote v-else-if="block.type === 'quote'">
        <p>{{ block.text }}</p>
        <footer v-if="block.cite">
          <cite>{{ block.cite }}</cite>
        </footer>
      </blockquote>
      <ol v-else-if="block.type === 'list' && block.style === 'numbered'">
        <li
          v-for="(item, i) in block.items"
          :key="i"
        >
          {{ item }}
        </li>
      </ol>
      <ul v-else-if="block.type === 'list'">
        <li
          v-for="(item, i) in block.items"
          :key="i"
        >
          {{ item }}
        </li>
      </ul>
      <figure
        v-else-if="block.type === 'embed' && block.embedSrc"
        class="prose__embed prose__embed--frame"
      >
        <iframe
          :src="block.embedSrc"
          :title="`Video ${PROVIDER_LABEL[block.provider]}`"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
        <figcaption>
          <a
            :href="block.url"
            target="_blank"
            rel="noopener noreferrer nofollow"
          >Tonton di sumber asli ({{ PROVIDER_LABEL[block.provider] }})</a>
        </figcaption>
      </figure>
      <p
        v-else-if="block.type === 'embed'"
        class="prose__embed"
      >
        <a
          :href="block.url"
          target="_blank"
          rel="noopener noreferrer nofollow"
        >Lihat di {{ PROVIDER_LABEL[block.provider] }}</a>
      </p>
    </template>
  </div>
</template>
