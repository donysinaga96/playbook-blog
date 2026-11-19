<!--
  Menu sebagai pohon (menu dan submenu dari tabel menus/menu_items).
  Rekursif: submenu memakai komponen ini lagi.
-->
<script setup lang="ts">
import type { MenuItemView } from '@framework/template-kit'

withDefaults(defineProps<{
  items: MenuItemView[]
  depth?: number
}>(), { depth: 0 })
</script>

<template>
  <ul
    v-if="items.length > 0"
    class="menu-tree"
    :class="depth === 0 ? 'menu-tree--root' : 'menu-tree--sub'"
  >
    <li
      v-for="(item, index) in items"
      :key="`${index}-${item.href}`"
      class="menu-tree__item"
      :class="{ 'menu-tree__item--parent': item.children.length > 0 }"
    >
      <a
        class="menu-tree__link"
        :href="item.href"
        :target="item.openInNewTab ? '_blank' : undefined"
        :rel="item.external || item.openInNewTab ? 'noopener noreferrer' : undefined"
      >{{ item.label }}</a>
      <MenuTree
        v-if="item.children.length > 0"
        :items="item.children"
        :depth="depth + 1"
      />
    </li>
  </ul>
</template>
