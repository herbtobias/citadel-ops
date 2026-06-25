// Citadel Ops — Leiter outbound webhooks (§13). HMAC-signed POST with one retry;
// every attempt is logged to webhook_deliveries.
import { createHmac } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../db'
import type { CitadelEvent } from './events'

const { webhookSubscriptions, webhookDeliveries } = schema

export async function dispatchWebhooks(evt: CitadelEvent) {
  if (!evt.projectId) return

  const subs = await db.select().from(webhookSubscriptions)
    .where(and(eq(webhookSubscriptions.projectId, evt.projectId), eq(webhookSubscriptions.active, true)))

  for (const sub of subs) {
    const subscribed = sub.events.length === 0 || sub.events.includes('*') || sub.events.includes(evt.type)
    if (!subscribed) continue

    const body = JSON.stringify(evt)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (sub.secret) headers['x-citadel-signature'] = `sha256=${createHmac('sha256', sub.secret).update(body).digest('hex')}`

    let ok = false
    let statusCode: number | null = null
    let error: string | null = null
    let attempts = 0
    for (attempts = 1; attempts <= 2; attempts++) {
      try {
        const res = await fetch(sub.url, { method: 'POST', headers, body })
        statusCode = res.status
        ok = res.ok
        if (ok) break
      }
      catch (e: any) {
        error = String(e?.message ?? e)
      }
    }

    await db.insert(webhookDeliveries).values({ subscriptionId: sub.id, event: evt.type, ok, statusCode, attempts: Math.min(attempts, 2), error })
  }
}
