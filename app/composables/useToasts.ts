// Tiny global toast store (no external dep). Client-only — toasts are pushed from
// live SSE events. Rendered once by <AppToaster> in the default layout.
export interface Toast {
  id: number
  title: string
  body?: string
  tone: 'info' | 'accent' | 'destructive'
}

let _seq = 0

export function useToasts() {
  const toasts = useState<Toast[]>('ct-toasts', () => [])

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function push(t: Omit<Toast, 'id'>) {
    const id = ++_seq
    toasts.value = [...toasts.value, { ...t, id }]
    if (import.meta.client) setTimeout(() => dismiss(id), 6000)
    return id
  }

  return { toasts, push, dismiss }
}
