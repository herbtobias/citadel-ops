import MarkdownIt from 'markdown-it'

/*
  Shared Markdown renderer for Archive doc bodies.

  `html: false` is markdown-it's documented XSS-safe mode: raw HTML in the source
  (bodyMarkdown is agent-written, recon scope) is escaped to inert text rather than
  rendered, so there is no stored-XSS path through `v-html`. Dangerous link schemes
  (`javascript:`, `vbscript:`, bad `data:`) are stripped by the default validateLink.
*/
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
})

// Harden links: hrefs come from untrusted content, so open them in a new tab and
// drop the opener/referrer (+ nofollow). markdown-it has no custom link_open rule
// by default, so falling through to self.renderToken() is the standard behaviour.
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  const token = tokens[idx]
  if (token) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer nofollow')
  }
  return self.renderToken(tokens, idx, options)
}

/** Render trusted-but-sanitized Markdown to an HTML string safe for `v-html`. */
export function renderMarkdown(src: string | null | undefined): string {
  if (!src) return ''
  return md.render(src)
}
