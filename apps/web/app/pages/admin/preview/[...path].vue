<!--
  Pratinjau tema (M4 4.4): halaman site dengan config draf, dirender di
  server (routeRules /admin/preview/** ssr: true). Segmen statis "preview"
  selalu menang atas pages/admin/[site]/*, jadi kode site seperti "media"
  tidak membuat pratinjau tertukar dengan layar admin.
-->
<template>
  <PublicPage />
</template>
