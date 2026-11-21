<!-- /admin/:site -> daftar artikel site itu. -->
<script setup lang="ts">
const route = useRoute()
await navigateTo(`/admin/${String(route.params['site'])}/articles`, { replace: true })
</script>

<template>
  <div />
</template>
