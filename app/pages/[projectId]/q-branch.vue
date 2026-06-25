<script setup lang="ts">
const route = useRoute()
const projectId = computed(() => route.params.projectId as string)

interface Gate { key: string, name: string, appliesToStatus: string, rule: Record<string, boolean>, blocking: boolean }
interface Harness { key: string, name: string, commands: Record<string, string> }
interface Guidelines { activeThemeKey: string, themeKey: string, guideline: { title: string, bodyMarkdown: string } | null, themes: { key: string, name: string }[] }

const { data } = await useAsyncData(
  'q-branch',
  async () => {
    const f = useRequestFetch()
    const [gates, harness, design] = await Promise.all([
      f<Gate[]>(`/api/v1/projects/${projectId.value}/quality-gates`),
      f<Harness[]>(`/api/v1/projects/${projectId.value}/harness`),
      f<Guidelines>(`/api/v1/projects/${projectId.value}/design-guidelines?theme=active`),
    ])
    return { gates, harness, design }
  },
  { watch: [projectId] },
)

function ruleList(rule: Record<string, boolean>) {
  return Object.entries(rule).filter(([, v]) => v).map(([k]) => k)
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8">
    <div class="flex items-center gap-3">
      <Icon name="lucide:flask-conical" class="size-7 text-accent" />
      <h1 class="ct-heading text-xl font-bold">Q-Branch</h1>
    </div>

    <!-- Quality Gates -->
    <section class="ct-card border border-border bg-card p-5">
      <h2 class="ct-label mb-3 text-muted-foreground">Quality Gates</h2>
      <ul class="space-y-3">
        <li v-for="g in data?.gates" :key="g.key" class="border-b border-border/50 pb-3 last:border-0">
          <div class="flex items-center justify-between">
            <span class="font-medium">{{ g.name }}</span>
            <span class="ct-label rounded bg-muted px-1.5 py-0.5 text-accent-tertiary">@ {{ g.appliesToStatus }}</span>
          </div>
          <div class="mt-1 flex flex-wrap gap-1">
            <span v-for="r in ruleList(g.rule)" :key="r" class="ct-label rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{{ r }}</span>
            <span v-if="g.blocking" class="ct-label rounded bg-muted px-1.5 py-0.5 text-destructive">blocking</span>
          </div>
        </li>
        <li v-if="!data?.gates?.length" class="text-sm text-muted-foreground">No gates configured.</li>
      </ul>
    </section>

    <!-- Harness -->
    <section class="ct-card border border-border bg-card p-5">
      <h2 class="ct-label mb-3 text-muted-foreground">Harness Definitions</h2>
      <div v-for="h in data?.harness" :key="h.key" class="space-y-1">
        <p class="font-medium">{{ h.name }}</p>
        <ul class="space-y-1 text-sm">
          <li v-for="(cmd, k) in h.commands" :key="k" class="flex gap-2">
            <span class="ct-label w-16 text-muted-foreground">{{ k }}</span>
            <code class="text-accent">{{ cmd }}</code>
          </li>
        </ul>
      </div>
      <p v-if="!data?.harness?.length" class="text-sm text-muted-foreground">No harness configured.</p>
    </section>

    <!-- Design Guideline + Theme registry -->
    <section class="ct-card border border-border bg-card p-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="ct-label text-muted-foreground">Design Guideline</h2>
        <span class="ct-label text-accent">active: {{ data?.design?.activeThemeKey }}</span>
      </div>
      <template v-if="data?.design?.guideline">
        <p class="font-medium">{{ data.design.guideline.title }}</p>
        <p class="mt-1 text-sm leading-relaxed text-muted-foreground">{{ data.design.guideline.bodyMarkdown }}</p>
      </template>
      <p v-else class="text-sm text-muted-foreground">No guideline for the active theme.</p>

      <div class="mt-4 flex flex-wrap gap-2">
        <span v-for="t in data?.design?.themes" :key="t.key"
          class="ct-label rounded-[var(--radius-card)] border border-border px-2 py-1"
          :class="t.key === data?.design?.activeThemeKey ? 'border-accent text-accent' : 'text-muted-foreground'">
          {{ t.name }}
        </span>
      </div>
    </section>
  </div>
</template>
