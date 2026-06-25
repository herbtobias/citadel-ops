<script setup lang="ts">
import type { Mission } from '~/types'

defineProps<{ mission: Mission }>()
defineEmits<{ open: [] }>()

const typeIcon: Record<string, string> = {
  design: 'lucide:pen-tool',
  feature: 'lucide:sparkles',
  test: 'lucide:flask-conical',
  bugfix: 'lucide:bug',
  spike: 'lucide:zap',
  chore: 'lucide:wrench',
  research: 'lucide:search',
}

const priorityColor: Record<string, string> = {
  low: 'text-muted-foreground',
  medium: 'text-accent-tertiary',
  high: 'text-accent-secondary',
  urgent: 'text-destructive',
}
</script>

<template>
  <article
    :data-mission-key="mission.key"
    class="ct-card ct-chamfer cursor-pointer p-3 transition-all hover:border-accent hover:ct-glow-sm"
    @click="$emit('open')"
  >
    <div class="mb-2 flex items-center justify-between">
      <span class="ct-label text-accent">{{ mission.key }}</span>
      <span
        class="ct-label rounded border border-border px-1.5 py-0.5 text-muted-foreground"
      >{{ mission.sector }}</span>
    </div>

    <p class="mb-2 line-clamp-2 text-sm font-medium leading-snug">{{ mission.title }}</p>

    <!-- Reference indicators (hand-off chain) -->
    <div v-if="mission.links.length" class="mb-2 flex flex-wrap gap-1">
      <span
        v-for="(l, i) in mission.links"
        :key="i"
        class="ct-label flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
        :title="`${l.linkType} ${l.targetKey}`"
      >
        <Icon name="lucide:link" class="size-3" />{{ l.linkType }} {{ l.targetKey }}
      </span>
    </div>

    <div class="flex items-center justify-between text-muted-foreground">
      <div class="flex items-center gap-2">
        <Icon :name="typeIcon[mission.type]" class="size-4" :class="priorityColor[mission.priority]" />
        <span v-if="mission.estimatePoints" class="ct-label">{{ mission.estimatePoints }}pt</span>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="mission.artifacts.length" class="flex items-center gap-0.5 text-xs">
          <Icon name="lucide:git-pull-request" class="size-3.5" />{{ mission.artifacts.length }}
        </span>
        <span v-if="mission.commentCount" class="flex items-center gap-0.5 text-xs">
          <Icon name="lucide:message-square" class="size-3.5" />{{ mission.commentCount }}
        </span>
        <span
          v-if="mission.claimedByAlias"
          class="flex size-6 items-center justify-center rounded-full border border-accent text-[10px] text-accent"
          :title="`Agent ${mission.claimedByAlias}`"
        >{{ mission.claimedByAlias }}</span>
      </div>
    </div>
  </article>
</template>
