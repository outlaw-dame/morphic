import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { AuthPageShell } from '@/components/auth/auth-page-shell'

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{ error: string }>
}) {
  const params = await searchParams

  return (
    <AuthPageShell
      title="Something went wrong."
      description="The sign-in flow could not finish. You can try again or return to search."
    >
      <Card className="gist-card-surface border">
        <CardHeader>
          <CardTitle className="font-[var(--font-display)] text-2xl font-semibold">
            Authentication error
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {params?.error ? (
            <p className="rounded-[var(--native-radius-control)] border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
              {params.error}
            </p>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              An unspecified error occurred.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/auth/login"
              className="gist-primary-button inline-flex h-10 items-center justify-center rounded-[var(--native-radius-control)] text-sm font-medium"
            >
              Try again
            </Link>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-[var(--native-radius-control)] border border-[var(--native-hairline)] bg-background/70 text-sm font-medium"
            >
              Back to search
            </Link>
          </div>
        </CardContent>
      </Card>
    </AuthPageShell>
  )
}
