// Boots the built Nitro server (.output/server/index.mjs) under V8 coverage.
// Node only flushes NODE_V8_COVERAGE on a *clean* exit, and a bare SIGTERM/SIGINT
// terminates without firing the exit hook — so translate those signals into
// process.exit(0), which runs the hook and writes the coverage profile. Used by
// the black-box coverage run (HTTP scenario + Playwright drive this server, then
// we SIGTERM it and report with c8). See npm run test:coverage:e2e.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => process.exit(0))
}

// Computed specifier (not a static string) so type-checkers/bundlers don't try to
// resolve .output at lint/typecheck time — it only exists after `npm run build`.
const entry = new URL('../.output/server/index.mjs', import.meta.url).href
await import(entry)
