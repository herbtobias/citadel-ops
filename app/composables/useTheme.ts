// Theme registry + active-theme control (§4). Themes are an override layer applied
// via the data-theme attribute on <html>. Seed themes ship here; later they come
// from the DB Theme registry via the API.
export interface ThemeMeta {
  key: string
  name: string
  blurb: string
}

export const THEMES: ThemeMeta[] = [
  { key: 'defcon-5', name: 'DEFCON 5', blurb: 'Editorial poster design — vermillion, sharp, type-led.' },
  { key: 'cyberwar', name: 'Cyberwar', blurb: 'Neon HUD — scanlines and glow, dialed back for legibility.' },
]

const STORAGE_KEY = 'citadel-theme-override'

export function useTheme() {
  // Manual override persists per browser; null means "follow active project".
  const override = useState<string | null>('theme-override', () => null)

  const projects = useProjectsStore()
  const ui = useUiStore()
  const route = useRoute()

  // Route param is the source of truth for the active project (matches SSR & client);
  // fall back to the UI store when off a project route.
  const projectTheme = computed(() => {
    const pid = (route.params.projectId as string) || ui.activeProjectId
    return projects.byId(pid)?.activeThemeKey ?? 'defcon-5'
  })

  const activeTheme = computed(() => override.value ?? projectTheme.value)

  function setOverride(theme: string | null) {
    override.value = theme
    if (import.meta.client) {
      if (theme) localStorage.setItem(STORAGE_KEY, theme)
      else localStorage.removeItem(STORAGE_KEY)
    }
  }

  function init() {
    if (import.meta.client) {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) override.value = saved
    }
  }

  return { THEMES, activeTheme, override, setOverride, init }
}
