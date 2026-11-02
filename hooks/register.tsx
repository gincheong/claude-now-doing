import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Call, Pending, Step } from '../types'

const calls = atom({ plugin: 'now-doing', key: 'calls' } as const, [], {
  shape: 'calls-1',
})
const step = atom({ plugin: 'now-doing', key: 'step' } as const, null)
const pending = atom({ plugin: 'now-doing', key: 'pending' } as const, null)

const LABEL_MAX = 48

const basename = (path: string) => path.split('/').filter(Boolean).pop() ?? path

const clip = (text: string) => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > LABEL_MAX ? `${one.slice(0, LABEL_MAX - 1)}…` : one
}

// Bash's own description is written for the user, so it beats the raw command.
const labelOf = (e: { tool: string } & Record<string, unknown>): string => {
  if (e.tool === 'Bash') return clip(String(e.description ?? e.command ?? ''))
  if (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'Read')
    return basename(String(e.file_path ?? ''))
  if (e.tool === 'Grep' || e.tool === 'Glob')
    return clip(String(e.pattern ?? ''))
  if (e.tool === 'Agent') return clip(String(e.description ?? ''))
  if (e.tool === 'WebFetch') return clip(String(e.url ?? ''))
  if (e.tool === 'WebSearch') return clip(String(e.query ?? ''))
  if (e.tool === 'Skill') return clip(String(e.skill ?? ''))
  return ''
}

// The model streams a tool's arguments as partial JSON: only a value whose
// closing quote has arrived is shown, so the label never ends mid-word.
const STREAMED_FIELD = /"(description|file_path|pattern|query|url|skill|command)"\s*:\s*"((?:[^"\\]|\\.)*)"/
const partialLabel = (json: string): string => {
  const hit = STREAMED_FIELD.exec(json)
  if (!hit) return ''
  const value = hit[2]!.replace(/\\(.)/g, '$1')
  return hit[1] === 'file_path' ? basename(value) : clip(value)
}

const MODE_WORD: Record<string, string> = {
  requesting: 'requesting',
  thinking: 'thinking',
  'tool-input': 'preparing a tool',
  'tool-use': 'running a tool',
  responding: 'writing',
}

let ticker: { cancel: () => void } | null = null

// Per-call elapsed seconds only move if something re-runs the draw.
function tick($: EngineInterface) {
  ticker ??= $.clock.every(1000, () => $.ui.invalidate('ui.render'))
}

function untick() {
  ticker?.cancel()
  ticker = null
}

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const call: Call = {
      id: e.tool_use_id,
      tool: e.tool,
      label: labelOf(e),
      startedAt: await $.clock.now(),
      agentId: e.agentId,
    }
    await update($, calls, list => [...list, call].slice(-50))
    tick($)
    try {
      return await next(e)
    } finally {
      const left = await update($, calls, list => list.filter(one => one.id !== call.id))
      if (left.length === 0) untick()
    }
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)

    const current: Step = { index: e.index, model: e.model }
    await update($, step, () => current)
    await update($, pending, () => null)

    const stream = next(e)
    let name = ''
    let json = ''
    let lastLabel = ''
    for await (const chunk of stream) {
      if (chunk.kind === 'tool') {
        name = chunk.name
        json = ''
        lastLabel = ''
        const shown: Pending = { tool: name, label: '' }
        await update($, pending, () => shown)
      } else if (chunk.kind === 'input' && name) {
        json += chunk.json
        const label = partialLabel(json)
        if (label && label !== lastLabel) {
          lastLabel = label
          const shown: Pending = { tool: name, label }
          await update($, pending, () => shown)
        }
      }
      yield chunk
    }
    return await stream.result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, calls, () => [])
      await update($, step, () => null)
      await update($, pending, () => null)
      untick()
    }
    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const list = await read($, calls)
    const now = await $.clock.now()

    const main = list.filter(one => one.agentId === undefined && one.tool !== 'Agent')
    const agents = list.filter(one => one.agentId === undefined && one.tool === 'Agent')

    let message: string
    if (main.length > 0) {
      const last = main[main.length - 1]!
      const secs = Math.max(0, Math.floor((now - last.startedAt) / 1000))
      const target = last.label ? ` ▸ ${last.label}` : ''
      const more = main.length > 1 ? ` +${main.length - 1}` : ''
      message = `${last.tool}${target}${more} · ${secs}s`
    } else {
      const current = await read($, step)
      const next_ = await read($, pending)
      const word = MODE_WORD[e.props.mode] ?? e.props.mode
      const stepTag = current ? ` · step ${current.index + 1}` : ''
      message =
        next_ && (e.props.mode === 'tool-input' || e.props.mode === 'tool-use')
          ? `preparing ${next_.tool}${next_.label ? ` ▸ ${next_.label}` : ''}${stepTag}`
          : `${word}${stepTag}`
    }

    if (agents.length > 0) {
      const who = agents.map(one => one.label).filter(Boolean).slice(0, 2).join(', ')
      message += ` · agent ×${agents.length}${who ? ` (${who})` : ''}`
    }

    return next({ ...e, props: { ...e.props, message } })
  })
}
