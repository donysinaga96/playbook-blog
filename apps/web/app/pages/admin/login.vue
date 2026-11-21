<!-- Login admin (ADR-009). -->
<script setup lang="ts">
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '../../assets/admin.css'

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const busy = ref(false)
const me = useAdminMe()

useHead({ title: 'Masuk ke admin', htmlAttrs: { lang: 'id' } })

async function submit() {
  busy.value = true
  error.value = null
  try {
    await $fetch('/api/admin/login', { method: 'POST', body: { email: email.value, password: password.value } })
    me.value = null
    await navigateTo('/admin')
  } catch (e) {
    error.value = apiErrorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="adm">
    <main class="adm-login">
      <form @submit.prevent="submit">
        <div>
          <h1>Masuk ke admin</h1>
          <p class="muted">
            Kelola artikel, halaman, dan menu semua site Anda.
          </p>
        </div>
        <label class="field">
          <span>Email</span>
          <input
            v-model="email"
            type="email"
            name="email"
            autocomplete="username"
            required
          >
        </label>
        <label class="field">
          <span>Password</span>
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
          class="field__error"
          role="alert"
        >
          {{ error }}
        </p>
        <button
          type="submit"
          class="btn btn--primary"
          :disabled="busy"
        >
          {{ busy ? 'Memeriksa…' : 'Masuk' }}
        </button>
      </form>
    </main>
  </div>
</template>
