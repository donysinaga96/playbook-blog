<!--
  Susunan section beranda (ADR-008): bawaan template, tanpa section, atau
  susunan sendiri. Props tiap section memakai form dari skema section.
-->
<script setup lang="ts">
interface SectionType { type: string; title: string; schema: Record<string, unknown> }
interface Item { type: string; props: Record<string, unknown> }

const props = withDefaults(defineProps<{ sections: SectionType[]; defaults: Item[]; maxSections: number; errors?: Record<string, string> }>(), { errors: () => ({}) })
/** undefined = bawaan template; [] = tanpa section; isi = susunan sendiri. */
const model = defineModel<Item[] | undefined>({ required: true })

const mode = computed({
  get: () => (model.value === undefined ? 'default' : model.value.length === 0 ? 'none' : 'custom'),
  set: (value: string) => {
    if (value === 'default') model.value = undefined
    else if (value === 'none') model.value = []
    else model.value = structuredClone(props.defaults.length ? props.defaults : [{ type: props.sections[0]?.type ?? '', props: {} }]).map((i) => ({ type: i.type, props: i.props ?? {} }))
  },
})

const titleOf = (type: string) => props.sections.find((s) => s.type === type)?.title ?? type
const schemaOf = (type: string) => props.sections.find((s) => s.type === type)?.schema ?? {}
const items = computed(() => model.value ?? [])

function update(index: number, patch: Partial<Item>) {
  model.value = items.value.map((item, i) => (i === index ? { ...item, ...patch } : item))
}
function move(index: number, delta: number) {
  const next = [...items.value]
  const [item] = next.splice(index, 1)
  if (item) next.splice(index + delta, 0, item)
  model.value = next
}
function remove(index: number) {
  const next = items.value.filter((_, i) => i !== index)
  model.value = next.length ? next : []
}
function add() {
  model.value = [...items.value, { type: props.sections[0]?.type ?? '', props: {} }]
}
</script>

<template>
  <div class="stack">
    <div
      class="adm-segmented"
      role="radiogroup"
      aria-label="Susunan beranda"
    >
      <label
        v-for="m in [['default', 'Bawaan template'], ['custom', 'Susunan sendiri'], ['none', 'Tanpa section']]"
        :key="m[0]"
        :class="{ 'is-on': mode === m[0] }"
      >
        <input
          v-model="mode"
          type="radio"
          name="mode-layout"
          :value="m[0]"
        >
        {{ m[1] }}
      </label>
    </div>
    <p
      v-if="mode === 'default'"
      class="field__hint"
    >
      Memakai susunan bawaan template: {{ defaults.map((d) => titleOf(d.type)).join(', ') || 'tanpa section' }}.
    </p>
    <p
      v-else-if="mode === 'none'"
      class="field__hint"
    >
      Beranda menampilkan pilihan redaksi dan daftar artikel terbaru, tanpa section.
    </p>
    <template v-else>
      <div
        v-for="(item, index) in items"
        :key="index"
        class="adm-layout-item"
      >
        <div class="adm-layout-item__head">
          <select
            :value="item.type"
            :aria-label="`Jenis section ke-${index + 1}`"
            :aria-invalid="!!fieldError(errors, `layouts.home.${index}.type`) || undefined"
            @change="update(index, { type: ($event.target as HTMLSelectElement).value, props: {} })"
          >
            <option
              v-for="s in sections"
              :key="s.type"
              :value="s.type"
            >
              {{ s.title }}
            </option>
          </select>
          <div class="adm-block__tools">
            <button
              type="button"
              :disabled="index === 0"
              :aria-label="`Naikkan section ke-${index + 1}`"
              @click="move(index, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              :disabled="index === items.length - 1"
              :aria-label="`Turunkan section ke-${index + 1}`"
              @click="move(index, 1)"
            >
              ↓
            </button>
            <button
              type="button"
              :aria-label="`Hapus section ke-${index + 1}`"
              @click="remove(index)"
            >
              ✕
            </button>
          </div>
        </div>
        <AdminSchemaForm
          :schema="schemaOf(item.type)"
          :path="`layouts.home.${index}.props`"
          :errors="errors"
          :model-value="item.props"
          @update:model-value="update(index, { props: $event })"
        />
      </div>
      <div>
        <button
          type="button"
          class="btn btn--small"
          :disabled="items.length >= maxSections"
          @click="add"
        >
          Tambah section
        </button>
      </div>
    </template>
  </div>
</template>
