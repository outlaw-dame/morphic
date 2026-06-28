import { AuthPageShell } from '@/components/auth/auth-page-shell'
import { LoginForm } from '@/components/login-form'

export default function Page() {
  return (
    <AuthPageShell
      title="Welcome back."
      description="Sign in to keep your history, saved sources, preferences, and model settings in sync."
    >
      <LoginForm />
    </AuthPageShell>
  )
}
