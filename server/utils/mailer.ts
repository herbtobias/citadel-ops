// Citadel Ops — outbound email (P8). SMTP via Nodemailer when configured; otherwise
// a no-op that logs the message (so dev works without a mail server, and we never
// silently pretend to have sent). Point SMTP_* at any provider or local Mailpit.
import nodemailer from 'nodemailer'
import { logger } from './logger'

type Mail = { to: string; subject: string; text: string; html?: string }

let transporter: nodemailer.Transporter | null = null
let resolved = false

function getTransport(): nodemailer.Transporter | null {
  if (resolved) return transporter
  resolved = true
  const host = process.env.SMTP_HOST
  if (!host) return (transporter = null)
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
  })
  return transporter
}

export async function sendMail(mail: Mail): Promise<{ sent: boolean }> {
  const from = process.env.MAIL_FROM || 'Citadel Ops <no-reply@citadel.test>'
  const t = getTransport()
  if (!t) {
    logger.info(
      { to: mail.to, subject: mail.subject },
      'email not sent (no SMTP configured) — logged only',
    )
    return { sent: false }
  }
  try {
    await t.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html })
    logger.info({ to: mail.to, subject: mail.subject }, 'email sent')
    return { sent: true }
  } catch (err) {
    logger.error({ err, to: mail.to }, 'email send failed')
    return { sent: false }
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

export async function sendInvitationEmail(opts: {
  to: string
  orgName: string
  role: string
  acceptUrl: string
}) {
  const subject = `You're invited to ${opts.orgName} on Citadel Ops`
  const text =
    `You've been invited as ${opts.role} to ${opts.orgName} on Citadel Ops.\n\n` +
    `Accept the invitation: ${opts.acceptUrl}\n\nThis link expires in 7 days.`
  const html =
    `<p>You've been invited as <strong>${escapeHtml(opts.role)}</strong> to ` +
    `<strong>${escapeHtml(opts.orgName)}</strong> on Citadel Ops.</p>` +
    `<p><a href="${opts.acceptUrl}">Accept the invitation</a> — expires in 7 days.</p>`
  return sendMail({ to: opts.to, subject, text, html })
}
