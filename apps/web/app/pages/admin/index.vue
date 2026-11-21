<!-- /admin: arahkan ke artikel site pertama yang boleh dikelola. -->
<script setup lang="ts">
const error = ref<string | null>(null)
const me = await ensureAdminMe().catch((e: unknown) => {
  if (apiStatus(e) !== 401) error.value = apiErrorMessage(e)
  return null
})
const first = me?.sites[0]
if (first) await navigateTo(`/admin/${first.code}/articles`, { replace: true })
</script>

<template>
  <p v-if="error">
    {{ error }}
  </p>
  <p v-else-if="!first">
    Tidak ada site yang bisa dikelola.
  </p>
</template>
