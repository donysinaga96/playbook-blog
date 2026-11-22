<!--
  Kerangka admin (ADR-009): rail kiri berisi pemilih site, navigasi, dan
  user; isi halaman di kanan. Hanya dipakai halaman /admin/:site/... (SPA).
  Superadmin punya tautan kembali ke dashboard pendapatan (ADR-011).
-->
<script setup lang="ts">
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '../assets/admin.css'

const me = useAdminMe()
const site = useAdminSite()
const route = useRoute()
const error = ref<string | null>(null)

await ensureAdminMe().catch((e) => {
  error.value = apiErrorMessage(e)
})

const nav = [
  { to: 'queue', label: 'Antrian terbit' },
  { to: 'articles', label: 'Artikel' },
  { to: 'pages', label: 'Halaman' },
  { to: 'categories', label: 'Kategori' },
  { to: 'tags', label: 'Tag' },
  { to: 'menus', label: 'Menu' },
  { to: 'media', label: 'Media' },
  { to: 'theme', label: 'Tema' },
  { to: 'settings', label: 'Pengaturan' },
]

/** Ganti site: tetap di bagian yang sama (mis. Artikel), di site lain. */
function switchSite(code: string) {
  const section = String(route.path.split('/')[3] ?? 'articles')
  const keep = nav.some((n) => n.to === section) ? section : 'articles'
  return navigateTo(`/admin/${code}/${keep}`)
}

/** Pindah ke login hanya bila server benar-benar menghapus sesi. */
async function logout() {
  try {
    await $fetch('/api/admin/logout', { method: 'POST' })
  } catch (e) {
    error.value = `Gagal keluar: ${apiErrorMessage(e)}. Sesi masih aktif; coba lagi.`
    return
  }
  me.value = null
  await navigateTo('/admin/login')
}

const queueCount = useQueueCount()
// Jumlah antrian diperbarui setiap pindah halaman (mis. setelah approve).
watch(() => route.path, () => { if (me.value) void refreshQueueCount() }, { immediate: true })
useHead({ title: () => (site.value ? `Admin · ${site.value.name}` : 'Admin'), htmlAttrs: { lang: 'id' } })
</script>

<template>
  <div class="adm">
    <p
      v-if="error"
      class="notice notice--error"
      role="alert"
    >
      {{ error }}
    </p>
    <div
      v-else-if="me"
      class="adm-shell"
    >
      <aside class="adm-rail">
        <NuxtLink
          v-if="me.user.isSuperadmin"
          to="/admin"
          class="adm-rail__back"
        >
          Dashboard pendapatan
        </NuxtLink>
        <div class="adm-rail__site">
          <label for="pilih-site">Site</label>
          <select
            id="pilih-site"
            :value="site?.code ?? ''"
            @change="switchSite(($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="s in me.sites"
              :key="s.id"
              :value="s.code"
            >
              {{ s.name }}
            </option>
          </select>
        </div>
        <nav
          class="adm-nav"
          aria-label="Admin"
        >
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="site ? `/admin/${site.code}/${item.to}` : '/admin'"
          >
            {{ item.label }}
            <span
              v-if="item.to === 'queue' && queueCount"
              class="count"
              :aria-label="`${queueCount} menunggu`"
            >{{ queueCount }}</span>
          </NuxtLink>
        </nav>
        <div class="adm-rail__user">
          <div>{{ me.user.displayName }}</div>
          <div class="muted">
            {{ me.user.email }}
          </div>
          <button
            type="button"
            class="btn btn--ghost btn--small"
            @click="logout"
          >
            Keluar
          </button>
        </div>
      </aside>
      <main class="adm-main">
        <p
          v-if="!site"
          class="notice notice--error"
        >
          Site tidak ditemukan atau Anda tidak punya akses.
        </p>
        <slot v-else />
      </main>
    </div>
  </div>
</template>
