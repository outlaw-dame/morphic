import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearEmergencyRateLimitCounters } from '@/lib/rate-limit/failure-policy'
import * as guestLimitModule from '@/lib/rate-limit/guest-limit'
import { checkAndEnforceGuestLimit } from '@/lib/rate-limit/guest-limit'

const mockRedisIncr = vi.fn()
const mockRedisExpire = vi.fn()

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    incr: mockRedisIncr,
    expire: mockRedisExpire
  }))
}))

describe('checkAndEnforceGuestLimit', () => {
  beforeEach(() => {
    mockRedisIncr.mockReset()
    mockRedisExpire.mockReset()
    process.env.MORPHIC_CLOUD_DEPLOYMENT = 'true'
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
    delete process.env.GUEST_CHAT_DAILY_LIMIT
    delete process.env.GUEST_RATE_LIMIT_FAILURE_MODE
    delete process.env.GUEST_RATE_LIMIT_EMERGENCY_CAP
    delete process.env.ENABLE_GUEST_CHAT
    clearEmergencyRateLimitCounters()
  })

  it('enables the three-search guest trial by default with an explicit opt-out', () => {
    expect(guestLimitModule.isGuestChatEnabled?.()).toBe(true)

    process.env.ENABLE_GUEST_CHAT = 'false'
    expect(guestLimitModule.isGuestChatEnabled?.()).toBe(false)
  })

  it('allows three local guest searches and gates the fourth without an ip', async () => {
    process.env.MORPHIC_CLOUD_DEPLOYMENT = 'false'

    expect(await checkAndEnforceGuestLimit(null)).toBeNull()
    expect(await checkAndEnforceGuestLimit(null)).toBeNull()
    expect(await checkAndEnforceGuestLimit(null)).toBeNull()

    const response = await checkAndEnforceGuestLimit(null)
    expect(response?.status).toBe(401)
    await expect(response?.json()).resolves.toMatchObject({
      authRequired: true,
      limit: 3,
      remaining: 0
    })
  })

  it('returns 401 when over the default limit', async () => {
    mockRedisIncr.mockResolvedValue(4)
    mockRedisExpire.mockResolvedValue(1)

    const response = await checkAndEnforceGuestLimit('1.2.3.4')
    expect(response).not.toBeNull()
    expect(response?.status).toBe(401)
    const body = await response!.json()
    expect(body.error).toBe('Please sign in to continue.')
    expect(body.authRequired).toBe(true)
    expect(body.limit).toBe(3)
  })

  it('uses configured limit when set', async () => {
    process.env.GUEST_CHAT_DAILY_LIMIT = '5'
    mockRedisIncr.mockResolvedValue(6)
    mockRedisExpire.mockResolvedValue(1)

    const response = await checkAndEnforceGuestLimit('5.6.7.8')
    expect(response).not.toBeNull()
    expect(response?.status).toBe(401)
    const body = await response!.json()
    expect(body.limit).toBe(5)
  })

  it('uses the three-search emergency cap when cloud redis is unavailable', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    expect(await checkAndEnforceGuestLimit('4.3.2.1')).toBeNull()
    expect(await checkAndEnforceGuestLimit('4.3.2.1')).toBeNull()
    expect(await checkAndEnforceGuestLimit('4.3.2.1')).toBeNull()

    const response = await checkAndEnforceGuestLimit('4.3.2.1')
    expect(response?.status).toBe(401)
    await expect(response?.json()).resolves.toMatchObject({
      authRequired: true,
      rateLimitUnavailable: true,
      emergencyLimit: 3
    })
  })

  it('allows request under the limit', async () => {
    mockRedisIncr.mockResolvedValue(3)
    mockRedisExpire.mockResolvedValue(1)

    const response = await checkAndEnforceGuestLimit('9.9.9.9')
    expect(response).toBeNull()
  })

  it('blocks guests when redis fails and guest policy is fail-closed', async () => {
    process.env.GUEST_RATE_LIMIT_FAILURE_MODE = 'fail-closed'
    mockRedisIncr.mockRejectedValue(new Error('redis down'))

    const response = await checkAndEnforceGuestLimit('9.9.9.9')
    const body = await response!.json()

    expect(response?.status).toBe(401)
    expect(body).toMatchObject({
      error: 'Please sign in to continue.',
      authRequired: true,
      rateLimitUnavailable: true
    })
  })

  it('uses an emergency cap when redis fails and guest policy is emergency-cap', async () => {
    process.env.GUEST_RATE_LIMIT_FAILURE_MODE = 'emergency-cap'
    process.env.GUEST_RATE_LIMIT_EMERGENCY_CAP = '1'
    mockRedisIncr.mockRejectedValue(new Error('redis down'))

    expect(await checkAndEnforceGuestLimit('7.7.7.7')).toBeNull()

    const response = await checkAndEnforceGuestLimit('7.7.7.7')
    const body = await response!.json()

    expect(response?.status).toBe(401)
    expect(body).toMatchObject({
      authRequired: true,
      rateLimitUnavailable: true,
      emergencyLimit: 1
    })
  })
})
