import { describe, expect, it } from 'vitest'

import {
  assessMobileSessionState,
  getSessionRecoveryAction,
  isSessionExpiredResponse
} from '../mobile-session-state'

describe('assessMobileSessionState', () => {
  it('returns authenticated when user is present and online', () => {
    const result = assessMobileSessionState({ hasUser: true, isOnline: true })
    expect(result.state).toBe('authenticated')
    expect(result.isOnline).toBe(true)
  })

  it('returns offline when not connected', () => {
    const result = assessMobileSessionState({ hasUser: true, isOnline: false })
    expect(result.state).toBe('offline')
    expect(result.canRetry).toBe(true)
  })

  it('returns unauthenticated when no user and online', () => {
    const result = assessMobileSessionState({ hasUser: false, isOnline: true })
    expect(result.state).toBe('unauthenticated')
    expect(result.message).toContain('Sign in')
  })

  it('returns offline even when user exists but network is down', () => {
    const result = assessMobileSessionState({ hasUser: true, isOnline: false })
    expect(result.state).toBe('offline')
  })
})

describe('isSessionExpiredResponse', () => {
  it('returns true for 401', () => {
    expect(isSessionExpiredResponse(401)).toBe(true)
  })

  it('returns false for other status codes', () => {
    expect(isSessionExpiredResponse(200)).toBe(false)
    expect(isSessionExpiredResponse(403)).toBe(false)
    expect(isSessionExpiredResponse(500)).toBe(false)
  })
})

describe('getSessionRecoveryAction', () => {
  it('returns login for expired sessions', () => {
    expect(getSessionRecoveryAction('expired')).toEqual({
      action: 'login',
      path: '/auth/login'
    })
  })

  it('returns login for unauthenticated', () => {
    expect(getSessionRecoveryAction('unauthenticated')).toEqual({
      action: 'login',
      path: '/auth/login'
    })
  })

  it('returns retry for offline', () => {
    expect(getSessionRecoveryAction('offline')).toEqual({ action: 'retry' })
  })

  it('returns none for authenticated', () => {
    expect(getSessionRecoveryAction('authenticated')).toEqual({
      action: 'none'
    })
  })
})
