<!--
  Kerangka konsol pendapatan (ADR-011): tampilan awal setelah login untuk
  superadmin. Rail kiri: Dashboard, sumber pemasukan, situs, operasional;
  tombol "Admin Blog" membuka admin konten (layout admin, ADR-009).
  User yang bukan superadmin langsung diarahkan ke Admin Blog.
-->
<script setup lang="ts">
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '../assets/admin.css'
import '../assets/revenue.css'

const me = useAdminMe()
const nav = useRevenueNav()
const route = useRoute()
const error = ref<string | null>(null)

await ensureAdminMe().catch((e) => {
  error.value = apiErrorMessage(e)
})

const blogHome = computed(() => (me.value?.sites[0] ? `/admin/${me.value.sites[0].code}/articles` : null))

if (me.value && !me.value.user.isSuperadmin) {
  if (blogHome.value) await navigateTo(blogHome.value, { replace: true })
} else if (me.value) {
  await refreshRevenueNav().catch((e) => {
    error.value = apiErrorMessage(e)
  })
}

const sources = computed(() => nav.value?.sources ?? [])
const properties = computed(() => (nav.value?.properties ?? []).filter((p) => p.status === 'ACTIVE'))

const health = computed(() => {
  const map = new Map<string, 'ok' | 'warn' | 'off'>()
  for (const s of sources.value) {
    if (!s.isActive) map.set(s.code, 'off')
    else if (s.lastSyncStatus === 'failed' || (s.canSync && !s.mock && !s.credentials.configured)) map.set(s.code, 'warn')
    else map.set(s.code, 'ok')
  }
  return map
})

async function logout() {
  try {
    await $fetch('/api/admin/logout', { method: 'POST' })
  } catch (e) {
    error.value = `Gagal keluar: ${apiErrorMessage(e)}. Sesi masih aktif; coba lagi.`
    return
  }
  me.value = null
  nav.value = null
  await navigateTo('/admin/login')
}

const isActive = (path: string) => route.path === path
useHead({ title: 'Pendapatan', htmlAttrs: { lang: 'id' } })
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
      v-else-if="me && me.user.isSuperadmin"
      class="adm-shell"
    >
      <aside class="adm-rail rv-rail">
        <div class="rv-rail__brand">
          <span
            class="rv-rail__mark"
            aria-hidden="true"
          />
          <span>Konsol pemilik</span>
        </div>
        <nav
          class="adm-nav"
          aria-label="Pendapatan"
        >
          <NuxtLink
            to="/admin"
            :class="{ 'router-link-active': isActive('/admin') }"
          >
            Dashboard
          </NuxtLink>
          <NuxtLink to="/admin/revenue/entries">
            Transaksi
          </NuxtLink>
        </nav>

        <nav
          class="adm-nav rv-rail__group"
          aria-labelledby="rail-sumber"
        >
          <h2 id="rail-sumber">
            Sumber pemasukan
          </h2>
          <NuxtLink
            v-for="s in sources"
            :key="s.code"
            :to="`/admin/revenue/sources/${s.code}`"
          >
            <span
              class="rv-dot"
              :style="{ background: colorFor(s.code, sources) }"
              aria-hidden="true"
            />
            {{ s.name }}
            <span
              v-if="health.get(s.code) === 'warn'"
              class="rv-flag"
              title="Perlu dicek: sync gagal atau kredensial belum diisi"
            ><span aria-hidden="true">!</span><span class="sr-only">perlu dicek</span></span>
            <span
              v-else-if="health.get(s.code) === 'off'"
              class="rv-flag rv-flag--off"
              title="Nonaktif"
            ><span aria-hidden="true">–</span><span class="sr-only">nonaktif</span></span>
          </NuxtLink>
        </nav>

        <nav
          class="adm-nav rv-rail__group"
          aria-labelledby="rail-situs"
        >
          <h2 id="rail-situs">
            Situs
          </h2>
          <NuxtLink
            v-for="p in properties"
            :key="p.code"
            :to="`/admin/revenue/sites/${p.code}`"
          >
            {{ p.name }}
          </NuxtLink>
          <NuxtLink
            to="/admin/revenue/sites"
            class="rv-rail__manage"
            :class="{ 'router-link-active': isActive('/admin/revenue/sites') }"
          >
            Kelola situs
          </NuxtLink>
        </nav>

        <nav
          class="adm-nav rv-rail__group"
          aria-labelledby="rail-operasional"
        >
          <h2 id="rail-operasional">
            Operasional
          </h2>
          <NuxtLink to="/admin/revenue/import">
            Impor file
          </NuxtLink>
          <NuxtLink to="/admin/revenue/connections">
            Koneksi &amp; log
          </NuxtLink>
          <NuxtLink to="/admin/revenue/fx">
            Kurs
          </NuxtLink>
        </nav>

        <div class="adm-rail__user">
          <NuxtLink
            v-if="blogHome"
            :to="blogHome"
            class="btn rv-rail__blog"
          >
            Admin Blog
          </NuxtLink>
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
        <slot />
      </main>
    </div>
  </div>
</template>
