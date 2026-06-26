<script setup lang="ts">
const projects = useProjectsStore()
const orgs = useOrgStore()

// Load shell data once, before the shell renders. Driven by the actual request
// (not the loggedIn ref, which isn't reliably set at SSR setup time): on public
// pages the calls 401 and we fall back to empty. useAsyncData transfers the SSR
// payload + Pinia state so the client doesn't refetch.
await useAsyncData('shell-bootstrap', async () => {
  try {
    await Promise.all([projects.fetchProjects(), orgs.fetchOrgs()])
    return { ok: true }
  } catch {
    return { ok: false }
  }
})

const { activeTheme, init } = useTheme()

// Bind the active theme on <html> (SSR-safe, no flash on navigation).
useHead({
  htmlAttrs: { 'data-theme': activeTheme },
  title: 'Citadel Ops',
})

onMounted(() => {
  init()
  orgs.initActiveOrg()
})
</script>

<template>
  <div class="ct-scanlines min-h-screen">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
