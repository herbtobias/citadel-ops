import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../app/utils/markdown'

describe('renderMarkdown', () => {
  it('renders headings, emphasis, lists, links and code', () => {
    const html = renderMarkdown(
      ['# Title', '', 'Some **bold** and *italic*.', '', '- one', '- two', '', '`inline`'].join(
        '\n',
      ),
    )
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<code>inline</code>')
  })

  it('renders GFM tables', () => {
    const html = renderMarkdown(['| a | b |', '| - | - |', '| 1 | 2 |'].join('\n'))
    expect(html).toContain('<table>')
    expect(html).toContain('<th>a</th>')
    expect(html).toContain('<td>1</td>')
  })

  it('renders fenced code blocks without executing their content', () => {
    const html = renderMarkdown(['```', '<script>alert(1)</script>', '```'].join('\n'))
    expect(html).toContain('<pre>')
    expect(html).toContain('<code>')
    // The script inside the fence is escaped, not a live tag.
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes raw HTML (no stored-XSS path)', () => {
    const html = renderMarkdown('<script>alert("xss")</script>\n\n<img src=x onerror=alert(1)>')
    // No live tags survive — everything dangerous is escaped to inert text.
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;img')
  })

  it('strips dangerous link schemes but keeps safe links hardened', () => {
    // markdown-it refuses to build an anchor for a javascript: href, so no
    // clickable link is produced (the text is left inert).
    const danger = renderMarkdown('[click](javascript:alert(1))')
    expect(danger).not.toContain('<a ')
    expect(danger).not.toContain('href')

    const safe = renderMarkdown('[home](https://example.com)')
    expect(safe).toContain('href="https://example.com"')
    expect(safe).toContain('rel="noopener noreferrer nofollow"')
    expect(safe).toContain('target="_blank"')
  })

  it('returns empty string for empty/nullish input', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown(null)).toBe('')
    expect(renderMarkdown(undefined)).toBe('')
  })
})
