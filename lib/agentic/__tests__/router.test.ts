import { describe, expect, it } from 'vitest'

import { classifyOperationRequest } from '../router'

describe('classifyOperationRequest', () => {
  it('routes current informational questions through fresh cited research', () => {
    expect(
      classifyOperationRequest(
        'What are the latest Cloudflare Workers AI models?'
      )
    ).toMatchObject({
      taskType: 'research',
      privacyLevel: 'external_allowed',
      requiresFreshness: true,
      requiresCitations: true,
      requiresTools: true,
      escalationPolicy: 'on_low_confidence'
    })
  })

  it('keeps user-owned local/feed context private by default', () => {
    expect(
      classifyOperationRequest(
        'Search my saved feeds and podcast transcripts for ActivityPub notes'
      )
    ).toMatchObject({
      taskType: 'research',
      privacyLevel: 'private_allowed',
      requiresTools: true,
      requiresCitations: true
    })
  })

  it('marks security and code requests as high risk deterministic work', () => {
    expect(
      classifyOperationRequest(
        'Review the SSRF protection code for bypasses and write tests'
      )
    ).toMatchObject({
      taskType: 'security_review',
      difficulty: 'high',
      requiresDeterminism: true,
      escalationPolicy: 'always_frontier'
    })
  })
})
