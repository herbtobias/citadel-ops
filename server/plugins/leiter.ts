// Citadel Ops — Leiter. Subscribes to the in-process event bus and fans each event
// out to (a) in-app notifications and (b) outbound webhooks. §13.
import { subscribeEvents } from '../utils/events'
import { notifyProject } from '../utils/notifications'
import { dispatchWebhooks } from '../utils/webhooks'

// Activity event → notification type (only the actionable ones).
const EVENT_TO_NOTIFICATION: Record<
  string,
  (typeof import('../db/schema').notificationType.enumValues)[number]
> = {
  submitted_for_review: 'review_requested',
  blocked: 'blocked',
  lease_expired: 'lease_expired',
  handed_off: 'handed_off',
  recon_completed: 'archive_updated',
  knowledge_quarantined: 'knowledge_quarantined',
}

export default defineNitroPlugin(() => {
  subscribeEvents((evt) => {
    const notifType = EVENT_TO_NOTIFICATION[evt.type]
    if (notifType && evt.projectId) {
      notifyProject(evt.projectId, notifType, {
        missionId: evt.missionId,
        message: evt.message,
      }).catch(() => {})
    }
    dispatchWebhooks(evt).catch(() => {})
  })
})
