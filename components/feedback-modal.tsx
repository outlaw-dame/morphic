'use client'

import { useState, useTransition } from 'react'

import {
  Emoji as Smile,
  EmojiSad as Frown,
  EmojiTalkingHappy as Meh
} from 'iconoir-react'
import { toast } from 'sonner'

import { submitFeedback } from '@/lib/actions/site-feedback'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

type Sentiment = 'positive' | 'neutral' | 'negative'

interface FeedbackModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeedbackModal({ open, onOpenChange }: FeedbackModalProps) {
  const [sentiment, setSentiment] = useState<Sentiment | null>(null)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = () => {
    if (!sentiment || !message.trim()) {
      toast.error('Please select your sentiment and write a message')
      return
    }

    startTransition(async () => {
      const result = await submitFeedback({
        sentiment,
        message: message.trim(),
        pageUrl: window.location.href
      })

      if (result.success) {
        toast.success('Thank you for your feedback!')
        // Reset form and close modal
        setSentiment(null)
        setMessage('')
        onOpenChange(false)
      } else {
        toast.error('Failed to submit feedback. Please try again later.')
      }
    })
  }

  const handleCancel = () => {
    setSentiment(null)
    setMessage('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="font-[var(--font-display)] text-2xl font-semibold">
            Give feedback
          </DialogTitle>
          <DialogDescription>
            Your feedback helps improve gist. Tell us what felt useful, unclear,
            or missing.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={sentiment === 'positive' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setSentiment('positive')}
              className={cn(
                'size-12 rounded-full',
                sentiment === 'positive' &&
                  'bg-[var(--indigo)] hover:bg-[var(--indigo)]'
              )}
            >
              <Smile className="size-6" />
            </Button>
            <Button
              type="button"
              variant={sentiment === 'neutral' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setSentiment('neutral')}
              className={cn(
                'size-12 rounded-full',
                sentiment === 'neutral' &&
                  'bg-[var(--indigo)] hover:bg-[var(--indigo)]'
              )}
            >
              <Meh className="size-6" />
            </Button>
            <Button
              type="button"
              variant={sentiment === 'negative' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setSentiment('negative')}
              className={cn(
                'size-12 rounded-full',
                sentiment === 'negative' &&
                  'bg-[var(--indigo)] hover:bg-[var(--indigo)]'
              )}
            >
              <Frown className="size-6" />
            </Button>
          </div>

          <Textarea
            placeholder="Your feedback"
            value={message}
            onChange={e => setMessage(e.target.value)}
            className="min-h-[150px] resize-none rounded-[var(--native-radius-control)] border-[var(--native-hairline)] bg-background/70"
          />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !sentiment || !message.trim()}
            >
              {isPending ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
