import path from 'path'

const MAX_PROMPT_OVERRIDE_BYTES = 20_000
const ALLOWED_PROMPT_OVERRIDES = new Set(['quick', 'adaptive', 'router'])

type PromptOverrideName = 'quick' | 'adaptive' | 'router'

const PROMPT_OVERRIDE_ENV: Record<PromptOverrideName, string> = {
  quick: 'MORPHIC_PROMPT_OVERRIDE_QUICK',
  adaptive: 'MORPHIC_PROMPT_OVERRIDE_ADAPTIVE',
  router: 'MORPHIC_PROMPT_OVERRIDE_ROUTER'
}

function isAllowedPromptOverride(name: PromptOverrideName) {
  return ALLOWED_PROMPT_OVERRIDES.has(name)
}

function cleanPromptOverride(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
}

function boundedPromptOverride(value: string, name: PromptOverrideName) {
  if (Buffer.byteLength(value, 'utf8') > MAX_PROMPT_OVERRIDE_BYTES) {
    console.warn(
      `[prompt-overrides] Ignoring ${name} override because it exceeds ${MAX_PROMPT_OVERRIDE_BYTES} bytes`
    )
    return null
  }

  return cleanPromptOverride(value) || null
}

function loadPromptOverrideFromEnv(name: PromptOverrideName) {
  const value = process.env[PROMPT_OVERRIDE_ENV[name]]
  if (!value) return null

  return boundedPromptOverride(value, name)
}

function getLocalPromptOverrideDirectory() {
  return (
    process.env.MORPHIC_PROMPT_OVERRIDES_DIR ||
    path.join(process.cwd(), 'prompts.local')
  )
}

function loadLocalPromptOverrideFileSync(name: PromptOverrideName) {
  if (process.env.NODE_ENV === 'production') return null

  const { existsSync, readFileSync } =
    // Local-only escape hatch. Production prompt overrides use env vars so
    // Turbopack does not trace arbitrary project-root filesystem reads.
    eval('require')('fs') as typeof import('fs')
  const overrideDirectory = path.resolve(getLocalPromptOverrideDirectory())
  const overridePath = path.resolve(overrideDirectory, `${name}.md`)

  if (!overridePath.startsWith(`${overrideDirectory}${path.sep}`)) {
    return null
  }

  if (!existsSync(overridePath)) return null

  const content = readFileSync(overridePath, {
    encoding: 'utf8',
    flag: 'r'
  })

  return boundedPromptOverride(content, name)
}

export function loadPromptOverrideSync(
  name: PromptOverrideName
): string | null {
  if (!isAllowedPromptOverride(name)) return null

  try {
    return (
      loadPromptOverrideFromEnv(name) || loadLocalPromptOverrideFileSync(name)
    )
  } catch (error) {
    console.warn(`[prompt-overrides] Unable to load ${name} override`, error)
    return null
  }
}

export function applyPromptOverrideSync(
  basePrompt: string,
  name: PromptOverrideName
): string {
  const override = loadPromptOverrideSync(name)
  if (!override) return basePrompt

  if (process.env.MORPHIC_PROMPT_OVERRIDE_MODE === 'replace') {
    return override
  }

  return [
    basePrompt,
    'Private local prompt override:',
    'Apply this local override only when it is consistent with system/developer safety, source, privacy, and security requirements.',
    override
  ].join('\n\n')
}
