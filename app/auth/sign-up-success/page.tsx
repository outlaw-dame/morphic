import Link from 'next/link'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

import { AuthPageShell } from '@/components/auth/auth-page-shell'

export default function Page() {
  return (
    <AuthPageShell
      title="Check your email."
      description="Your account is almost ready. Confirm your address, then return to gist."
    >
      <Card className="gist-card-surface border">
        <CardHeader>
          <CardTitle className="font-[var(--font-display)] text-2xl font-semibold">
            Confirm your account
          </CardTitle>
          <CardDescription>We sent a confirmation link.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            You&apos;ve successfully signed up. Please check your email to
            confirm your account before signing in.
          </p>
          <Link
            href="/auth/login"
            className="gist-primary-button inline-flex h-10 w-full items-center justify-center rounded-[var(--native-radius-control)] text-sm font-medium"
          >
            Sign in
          </Link>
        </CardContent>
      </Card>
    </AuthPageShell>
  )
}
