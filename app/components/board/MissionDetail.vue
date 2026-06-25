<script setup lang="ts">
import type { Mission } from '~/types'

defineProps<{ mission: Mission | null }>()
defineEmits<{ close: [], 'open-key': [key: string] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="mission"
        class="fixed inset-0 z-[60] flex items-start justify-end bg-black/60"
        @click.self="$emit('close')"
      >
        <div class="ct-scanlines h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card p-6">
          <div class="mb-4 flex items-start justify-between">
            <div>
              <span class="ct-label text-accent">{{ mission.key }} · {{ mission.sector }} · {{ mission.type }}</span>
              <h2 class="ct-heading mt-1 text-xl font-bold">{{ mission.title }}</h2>
            </div>
            <button class="text-muted-foreground hover:text-accent" @click="$emit('close')">
              <Icon name="lucide:x" class="size-5" />
            </button>
          </div>

          <section class="mb-5">
            <p class="ct-label mb-1 text-muted-foreground">Briefing</p>
            <p class="text-sm leading-relaxed">{{ mission.briefing }}</p>
          </section>

          <section v-if="mission.acceptanceCriteria.length" class="mb-5">
            <p class="ct-label mb-1 text-muted-foreground">Acceptance Criteria</p>
            <ul class="space-y-1 text-sm">
              <li v-for="(c, i) in mission.acceptanceCriteria" :key="i" class="flex items-center gap-2">
                <Icon name="lucide:check-circle-2" class="size-4 text-accent" />{{ c }}
              </li>
            </ul>
          </section>

          <section v-if="mission.links.length" class="mb-5">
            <p class="ct-label mb-1 text-muted-foreground">References</p>
            <ul class="space-y-1 text-sm">
              <li v-for="(l, i) in mission.links" :key="i" class="flex items-center gap-2 text-muted-foreground">
                <Icon name="lucide:link" class="size-4 text-accent-tertiary" />
                <span class="text-accent-tertiary">{{ l.linkType }}</span>
                <button
                  v-if="l.targetKind === 'mission'"
                  class="text-foreground underline-offset-2 hover:text-accent hover:underline"
                  @click="$emit('open-key', l.targetKey)"
                >{{ l.targetKey }}</button>
                <span v-else>{{ l.targetKey }}</span>
              </li>
            </ul>
          </section>

          <section v-if="mission.artifacts.length" class="mb-5">
            <p class="ct-label mb-1 text-muted-foreground">Artifacts</p>
            <ul class="space-y-1 text-sm">
              <li v-for="a in mission.artifacts" :key="a.id" class="flex items-center gap-2">
                <Icon name="lucide:git-pull-request" class="size-4 text-accent" />{{ a.label }}
              </li>
            </ul>
          </section>

          <div class="ct-label flex gap-4 border-t border-border pt-4 text-muted-foreground">
            <span>Status: <span class="text-foreground">{{ mission.status }}</span></span>
            <span>Priority: <span class="text-foreground">{{ mission.priority }}</span></span>
            <span v-if="mission.claimedByAlias">Agent: <span class="text-accent">{{ mission.claimedByAlias }}</span></span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
