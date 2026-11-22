<!--
  /admin: tampilan awal setelah login. Superadmin melihat dashboard
  pendapatan semua situs (ADR-011); user lain diarahkan layout console ke
  Admin Blog (artikel site pertama yang boleh dikelola).
-->
<script setup lang="ts">
definePageMeta({ layout: 'console' })
</script>

<template>
  <RevenueDashboardOverview />
</template>
