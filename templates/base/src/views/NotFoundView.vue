<script setup lang="ts">
import type { NotFoundView } from '@framework/template-kit'

defineProps<{ vm: NotFoundView }>()
</script>

<template>
  <div class="view view--not-found not-found">
    <h1 class="not-found__title">
      Halaman tidak ditemukan
    </h1>
    <p>
      Tidak ada halaman di <code>{{ vm.path }}</code>. Mungkin sudah dipindah atau alamatnya salah ketik.
    </p>
    <p>
      <a href="/">Kembali ke beranda</a>
    </p>
  </div>
</template>
