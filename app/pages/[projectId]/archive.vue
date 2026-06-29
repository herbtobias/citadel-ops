<script setup lang="ts">
const route = useRoute()
const projectId = computed(() => route.params.projectId as string)

interface KnowledgeDoc {
  id: string
  path: string
  level: number
  summary: string
  bodyMarkdown: string
  parentId: string | null
  updatedAt: string | null
}

const { data: docs } = await useAsyncData(
  'archive',
  () => useRequestFetch()<KnowledgeDoc[]>(`/api/v1/projects/${projectId.value}/knowledge`),
  { watch: [projectId] },
)

// Which docs have their full body expanded (summaries show by default).
const open = ref<Record<string, boolean>>({})
function toggle(id: string) {
  open.value[id] = !open.value[id]
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <div class="flex items-center gap-3">
      <Icon name="lucide:library" class="size-7 text-accent" />
      <h1 class="ct-heading text-xl font-bold">The Archive</h1>
    </div>
    <p class="ct-label text-muted-foreground">
      Institutional memory — what the Scout, Interrogator, and Archivist filed for this project.
    </p>

    <section class="ct-card border border-border bg-card p-5">
      <ul class="space-y-3">
        <li
          v-for="d in docs"
          :key="d.id"
          class="border-b border-border/50 pb-3 last:border-0"
          :style="{ paddingLeft: `${Math.min(d.level, 4) * 0.75}rem` }"
        >
          <button
            type="button"
            class="flex w-full items-center gap-2 text-left"
            @click="toggle(d.id)"
          >
            <Icon
              :name="open[d.id] ? 'lucide:chevron-down' : 'lucide:chevron-right'"
              class="size-4 shrink-0 text-muted-foreground"
            />
            <code class="ct-label text-accent">{{ d.path }}</code>
            <span class="ct-label rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
              >L{{ d.level }}</span
            >
          </button>
          <p class="mt-1 pl-6 text-sm leading-relaxed text-muted-foreground">{{ d.summary }}</p>
          <!-- eslint-disable vue/no-v-html -- renderMarkdown() runs markdown-it with html:false, so raw HTML is escaped and the output is sanitized (see app/utils/markdown.ts) -->
          <div
            v-if="open[d.id] && d.bodyMarkdown"
            class="ct-markdown mt-2 ml-6 overflow-x-auto rounded-[var(--radius-card)] border border-border bg-background p-3 text-sm leading-relaxed text-foreground"
            v-html="renderMarkdown(d.bodyMarkdown)"
          />
          <!-- eslint-enable vue/no-v-html -->
          <p
            v-else-if="open[d.id]"
            class="mt-2 ml-6 text-sm italic leading-relaxed text-muted-foreground"
          >
            (no body)
          </p>
          <p v-if="open[d.id]" class="mt-1 pl-6 ct-label text-muted-foreground">
            updated {{ fmt(d.updatedAt) }}
          </p>
        </li>
        <li v-if="!docs?.length" class="py-4 text-center text-sm text-muted-foreground">
          The Archive is empty. Run the Scout (<code class="text-accent">/citadel-scout</code>) to
          fill it.
        </li>
      </ul>
    </section>
  </div>
</template>
