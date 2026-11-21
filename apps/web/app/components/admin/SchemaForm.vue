<!--
  Form yang dibangkitkan dari JSON Schema manifest template (M4 4.4):
  object -> kelompok, enum -> pilihan, boolean -> centang, angka -> angka,
  string berpola warna hex -> pemilih warna. Label dari title/description
  skema (.meta() di manifest), jadi admin tidak menulis ulang daftar field.
-->
<script setup lang="ts">
defineOptions({ name: 'AdminSchemaForm' })

type Schema = Record<string, unknown>

const props = withDefaults(defineProps<{ schema: Schema; path?: string; errors?: Record<string, string> }>(), { path: '', errors: () => ({}) })
const model = defineModel<Record<string, unknown>>({ required: true })

const fields = computed(() => Object.entries((props.schema['properties'] ?? {}) as Record<string, Schema>))
const at = (key: string) => (props.path ? `${props.path}.${key}` : key)
const label = (key: string, s: Schema) => (typeof s['title'] === 'string' ? s['title'] : key)
const isColor = (s: Schema) => s['type'] === 'string' && typeof s['pattern'] === 'string' && (s['pattern'] as string).includes('#[0-9a-f')
const kind = (s: Schema) =>
  s['type'] === 'object' ? 'object'
    : Array.isArray(s['enum']) ? 'enum'
      : s['type'] === 'boolean' ? 'boolean'
        : s['type'] === 'integer' || s['type'] === 'number' ? 'number'
          : isColor(s) ? 'color'
            : 'text'

function set(key: string, value: unknown) {
  const next = { ...model.value }
  if (value === undefined || value === '') delete next[key]
  else next[key] = value
  model.value = next
}
const child = (key: string) => (model.value[key] && typeof model.value[key] === 'object' ? (model.value[key] as Record<string, unknown>) : {})
const num = (s: Schema, key: string) => (typeof s[key] === 'number' ? (s[key] as number) : undefined)
const err = (key: string) => fieldError(props.errors, at(key))
</script>

<template>
  <div class="stack">
    <template
      v-for="[key, s] in fields"
      :key="key"
    >
      <fieldset
        v-if="kind(s) === 'object'"
        class="adm-fieldset"
      >
        <legend>{{ label(key, s) }}</legend>
        <AdminSchemaForm
          :schema="s"
          :path="at(key)"
          :errors="errors"
          :model-value="child(key)"
          @update:model-value="set(key, $event)"
        />
      </fieldset>

      <label
        v-else-if="kind(s) === 'boolean'"
        class="check"
      >
        <input
          type="checkbox"
          :checked="Boolean(model[key])"
          @change="set(key, ($event.target as HTMLInputElement).checked)"
        >
        {{ label(key, s) }}
      </label>

      <label
        v-else
        class="field"
      >
        <span>{{ label(key, s) }}</span>
        <select
          v-if="kind(s) === 'enum'"
          :value="model[key] ?? s['default'] ?? ''"
          :aria-invalid="!!err(key) || undefined"
          @change="set(key, ($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="option in (s['enum'] as string[])"
            :key="option"
            :value="option"
          >
            {{ option }}
          </option>
        </select>
        <span
          v-else-if="kind(s) === 'color'"
          class="adm-color"
        >
          <input
            type="color"
            :value="String(model[key] ?? '#000000')"
            :aria-label="label(key, s)"
            @input="set(key, ($event.target as HTMLInputElement).value)"
          >
          <input
            type="text"
            class="mono"
            :value="String(model[key] ?? '')"
            :aria-invalid="!!err(key) || undefined"
            @change="set(key, ($event.target as HTMLInputElement).value.trim())"
          >
        </span>
        <input
          v-else-if="kind(s) === 'number'"
          type="number"
          :min="num(s, 'minimum')"
          :max="num(s, 'maximum')"
          :value="model[key] ?? s['default'] ?? ''"
          :placeholder="s['default'] !== undefined ? String(s['default']) : ''"
          :aria-invalid="!!err(key) || undefined"
          @input="set(key, ($event.target as HTMLInputElement).value === '' ? undefined : Number(($event.target as HTMLInputElement).value))"
        >
        <input
          v-else
          type="text"
          :value="String(model[key] ?? '')"
          :aria-invalid="!!err(key) || undefined"
          @input="set(key, ($event.target as HTMLInputElement).value)"
        >
        <span
          v-if="err(key)"
          class="field__error"
        >{{ err(key) }}</span>
        <span
          v-else-if="typeof s['description'] === 'string'"
          class="field__hint"
        >{{ s['description'] }}</span>
      </label>
    </template>
  </div>
</template>
