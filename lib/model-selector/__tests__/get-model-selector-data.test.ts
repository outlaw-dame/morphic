import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('next/headers', () => ({
  cookies: vi.fn()
}))

vi.mock('@/lib/models/fetch-models', () => ({
  fetchAvailableModels: vi.fn()
}))

vi.mock('@/lib/utils/registry', () => ({
  isProviderEnabled: vi.fn()
}))

import { cookies } from 'next/headers'

import { DEFAULT_MODEL } from '@/lib/config/default-model'
import { fetchAvailableModels } from '@/lib/models/fetch-models'
import { isProviderEnabled } from '@/lib/utils/registry'

import { getModelSelectorData } from '../get-model-selector-data'

const mockCookies = vi.mocked(cookies)
const mockFetchAvailableModels = vi.mocked(fetchAvailableModels)
const mockIsProviderEnabled = vi.mocked(isProviderEnabled)

describe('getModelSelectorData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.MORPHIC_CLOUD_DEPLOYMENT
    mockCookies.mockResolvedValue({
      get: vi.fn()
    } as any)
  })

  it('surfaces the enabled default model when live model discovery is empty', async () => {
    mockFetchAvailableModels.mockResolvedValue({})
    mockIsProviderEnabled.mockImplementation(
      providerId => providerId === DEFAULT_MODEL.providerId
    )

    const data = await getModelSelectorData()

    expect(data).toEqual({
      enabled: true,
      modelsByProvider: {
        [DEFAULT_MODEL.provider]: [DEFAULT_MODEL]
      },
      selectedModelKey: `${DEFAULT_MODEL.providerId}:${DEFAULT_MODEL.id}`,
      hasAvailableModels: true
    })
  })

  it('does not invent a default model when the provider is disabled', async () => {
    mockFetchAvailableModels.mockResolvedValue({})
    mockIsProviderEnabled.mockReturnValue(false)

    const data = await getModelSelectorData()

    expect(data).toEqual({
      enabled: true,
      modelsByProvider: {},
      selectedModelKey: '',
      hasAvailableModels: false
    })
  })
})
