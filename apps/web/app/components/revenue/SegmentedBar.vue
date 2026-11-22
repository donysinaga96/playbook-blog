<!--
  Komposisi pendapatan per sumber sebagai satu batang 28px (skill dataviz,
  "tall segmented bar"): lebar sebanding nilai, porsi tercetak di dalam blok
  bila muat, nama ada di legenda (urutan sama dengan blok). Hover/fokus
  setiap blok memberi nama, jumlah, dan porsi.
-->
<script setup lang="ts">
export interface BarPart {
  key: string
  name: string
  value: number
  color: string
  ink: string
}

const props = defineProps<{ parts: BarPart[]; currency: string }>()

const positive = computed(() => props.parts.filter((p) => p.value > 0))
const total = computed(() => positive.value.reduce((n, p) => n + p.value, 0))
const pct = new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 0 })

const blocks = computed(() => positive.value.map((p) => {
  const share = total.value ? p.value / total.value : 0
  return { ...p, share, label: pct.format(share), wide: share >= 0.07 }
}))

const ariaLabel = computed(() => `Komposisi per sumber: ${blocks.value.map((b) => `${b.name} ${b.label}`).join(', ')}`)
</script>

<template>
  <div class="rv-seg">
    <div
      class="rv-seg__bar"
      role="img"
      :aria-label="ariaLabel"
    >
      <span
        v-for="b in blocks"
        :key="b.key"
        class="rv-seg__part"
        tabindex="0"
        :style="{ flexGrow: b.value, background: b.color, color: b.ink }"
        :title="`${b.name}: ${formatMoney(b.value, currency)} (${b.label})`"
        :aria-label="`${b.name}: ${formatMoney(b.value, currency)}, ${b.label}`"
      >
        <span v-if="b.wide">{{ b.label }}</span>
      </span>
      <span
        v-if="!blocks.length"
        class="rv-seg__empty"
      >Belum ada pemasukan di rentang ini</span>
    </div>
    <ul class="rv-legend">
      <li
        v-for="b in blocks"
        :key="b.key"
      >
        <span
          class="rv-legend__swatch"
          :style="{ background: b.color }"
        />
        <span>{{ b.name }}</span>
        <span class="rv-legend__value">{{ formatMoney(b.value, currency) }}</span>
      </li>
    </ul>
  </div>
</template>
