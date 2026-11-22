<!-- Detail satu situs: dashboard yang sama, difilter ke situs ini (ADR-011). -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

const route = useRoute()
const nav = useRevenueNav()
const property = computed(() => nav.value?.properties.find((p) => p.code === route.params['code']) ?? null)
useHead({ title: () => (property.value ? `${property.value.name} · Pendapatan` : 'Situs') })
</script>

<template>
  <RevenueDashboardOverview
    v-if="property"
    :key="property.id"
    :property="property"
  />
  <p
    v-else
    class="notice notice--error"
  >
    Situs tidak ditemukan. <NuxtLink to="/admin/revenue/sites">
      Kelola situs
    </NuxtLink>
  </p>
</template>
