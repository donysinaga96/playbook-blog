<!-- Beranda admin: user login dan site yang bisa dikelola (ADR-009). -->
<script setup lang="ts">
const me = useAdminMe()
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    me.value = await $fetch<AdminMe>('/api/admin/me')
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 401) return navigateTo('/admin/login')
    error.value = apiErrorMessage(e)
  }
})

async function logout() {
  try {
    await $fetch('/api/admin/logout', { method: 'POST' })
    me.value = null
    await navigateTo('/admin/login')
  } catch (e) {
    error.value = `Gagal keluar: ${apiErrorMessage(e)}`
  }
}
</script>

<template>
  <main class="admin-home">
    <p
      v-if="error"
      role="alert"
    >
      {{ error }}
    </p>
    <template v-else-if="me">
      <h1>Halo, {{ me.user.displayName }}</h1>
      <h2>Site</h2>
      <ul>
        <li
          v-for="site in me.sites"
          :key="site.id"
        >
          {{ site.name }} ({{ site.code }})
        </li>
      </ul>
      <button
        type="button"
        @click="logout"
      >
        Keluar
      </button>
    </template>
    <p v-else>
      Memuat…
    </p>
  </main>
</template>
