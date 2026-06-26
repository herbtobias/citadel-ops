// Citadel Ops — HTTP test harness. A tiny fetch client with a cookie jar (for HQ
// session auth) and Bearer support (for agent licenses), used by both the automated
// HTTP scenario test and the narrated `npm run demo`.

export interface StepResult {
  name: string
  ok: boolean
  detail: string
}

export interface ApiResult {
  status: number
  data: any
}

export function makeClient(baseUrl: string) {
  let cookie = ''

  async function api(
    method: string,
    path: string,
    opts: { body?: unknown; bearer?: string; idem?: string } = {},
  ): Promise<ApiResult> {
    const headers: Record<string, string> = {}
    if (opts.body !== undefined) headers['content-type'] = 'application/json'
    if (cookie) headers.cookie = cookie
    if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`
    if (opts.idem) headers['idempotency-key'] = opts.idem

    const res = await fetch(baseUrl + path, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
    const setCookies = (res.headers as any).getSetCookie?.() ?? []
    if (setCookies.length) cookie = setCookies.map((c: string) => c.split(';')[0]).join('; ')

    const text = await res.text()
    let data: any
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    return { status: res.status, data }
  }

  return {
    baseUrl,
    api,
    get: (p: string, o = {}) => api('GET', p, o),
    post: (p: string, body?: unknown, o: any = {}) => api('POST', p, { ...o, body }),
    del: (p: string, o = {}) => api('DELETE', p, o),
  }
}

export type Client = ReturnType<typeof makeClient>

// A step recorder: runs fn, captures pass/fail + a one-line detail. `assert` throws
// to fail the current step.
export function makeRunner() {
  const steps: StepResult[] = []
  async function step(name: string, fn: () => Promise<string>) {
    try {
      const detail = await fn()
      steps.push({ name, ok: true, detail })
    } catch (e: any) {
      steps.push({ name, ok: false, detail: String(e?.message ?? e) })
    }
  }
  return { steps, step }
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

export async function isReachable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(baseUrl + '/health')
    return res.ok
  } catch {
    return false
  }
}
