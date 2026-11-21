<!-- Login admin (ADR-009). Tampilan lengkap admin dikerjakan di 4.2. -->
<script setup lang="ts">
const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = null
  try {
    await $fetch('/api/admin/login', { method: 'POST', body: { email: email.value, password: password.value } })
    await navigateTo('/admin')
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="admin-login">
    <h1>Masuk ke admin</h1>
    <form @submit.prevent="submit">
      <label>
        Email
        <input
          v-model="email"
          type="email"
          name="email"
          autocomplete="username"
          required
        >
      </label>
      <label>
        Password
        <input
          v-model="password"
          type="password"
          name="password"
          autocomplete="current-password"
          required
        >
      </label>
      <p
        v-if="error"
        role="alert"
      >
        {{ error }}
      </p>
      <button
        type="submit"
        :disabled="busy"
      >
        Masuk
      </button>
    </form>
  </main>
</template>
