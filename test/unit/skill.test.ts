import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listCitadelToolNames } from '../mcp-util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

describe('Claude skill: /citadel-work', () => {
  const skill = read('.claude/skills/citadel-work/SKILL.md')

  it('has valid frontmatter (name matches dir + a description)', () => {
    const fm = skill.match(/^---\n([\s\S]*?)\n---/)
    expect(fm, 'missing frontmatter').toBeTruthy()
    const block = fm![1]
    expect(block.match(/name:\s*(.+)/)?.[1].trim()).toBe('citadel-work')
    expect(block.match(/description:\s*(.+)/)?.[1].trim().length ?? 0).toBeGreaterThan(20)
  })

  it('only references citadel_* tools that the MCP server actually registers (no drift)', async () => {
    const registered = new Set(await listCitadelToolNames())
    const referenced = [...new Set(skill.match(/citadel_[a-z]+(?:_[a-z]+)*/g) ?? [])]
    expect(referenced.length, 'skill should mention some citadel_* tools').toBeGreaterThan(3)
    const unknown = referenced.filter((t) => !registered.has(t))
    expect(unknown, `skill references tools the MCP server does not expose: ${unknown}`).toEqual([])
  })
})

describe('.mcp.json.example', () => {
  it('is valid JSON and wires the citadel stdio server', () => {
    const cfg = JSON.parse(read('.mcp.json.example'))
    const citadel = cfg.mcpServers?.citadel
    expect(citadel, 'missing mcpServers.citadel').toBeTruthy()
    expect(citadel.command).toBeTruthy()
    expect(citadel.args).toEqual(expect.arrayContaining(['mcp/stdio.ts']))
    expect(citadel.env).toHaveProperty('CITADEL_LICENSE')
    expect(citadel.env).toHaveProperty('CITADEL_URL')
  })
})
