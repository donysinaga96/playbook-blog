<!--
  Akar aplikasi: halaman publik (pages/[...slug].vue, dirender di server,
  ADR-007, tanpa layout) dan admin (pages/admin/, SPA, ADR-009, layout admin).
-->
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
body {
  margin: 0;
}
</style>
