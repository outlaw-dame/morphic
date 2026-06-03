'use client'

import { AlertTriangle, ExternalLink } from 'lucide-react'

import {
  assessExternalNavigation,
  type ExternalNavigationAssessment
} from '@/lib/security/external-navigation'
import type { SafeBrowsingResult } from '@/lib/security/safe-browsing'

interface LeavingMorphicDialogProps {
  href: string
  appOrigin: string
  isCheckingSafety?: boolean
  safeBrowsingResult?: SafeBrowsingResult | null
  onContinue: () => void
  onCancel: () => void
}

export function LeavingMorphicDialog({
  href,
  appOrigin,
  isCheckingSafety = false,
  safeBrowsingResult = null,
  onContinue,
  onCancel
}: LeavingMorphicDialogProps) {
  const assessment: ExternalNavigationAssessment = assessExternalNavigation(
    href,
    appOrigin
  )

  if (assessment.risk === 'none') {
    return null
  }

  return (
    <div className="native-translucent-surface rounded-[var(--native-radius-sheet)] border p-5 shadow-lg">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div className="space-y-3">
          <div>
            <h2 className="font-semibold">Leaving Morphic</h2>
            <p className="text-sm text-muted-foreground">
              {assessment.reason}
            </p>
          </div>

          {assessment.displayHost && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              Destination: {assessment.displayHost}
            </div>
          )}

          {safeBrowsingResult && !safeBrowsingResult.safe && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Google Safe Browsing flagged this destination
              {safeBrowsingResult.threatTypes.length > 0
                ? ` for ${safeBrowsingResult.threatTypes.join(', ')}`
                : ''}
              . Morphic will not open it.
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm"
              onClick={onCancel}
            >
              Stay in Morphic
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
              disabled={isCheckingSafety || safeBrowsingResult?.safe === false}
              onClick={onContinue}
            >
              {isCheckingSafety
                ? 'Checking...'
                : safeBrowsingResult?.safe === false
                  ? 'Blocked'
                  : 'Continue'}
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
