import { AuthPageShell } from '@/components/auth/auth-page-shell'
import { SignUpForm } from '@/components/sign-up-form'

export default function Page() {
  return (
    <AuthPageShell
      title="Make gist yours."
      description="Create an account when you are ready to save research, tune sources, and return to previous searches."
    >
      <SignUpForm />
    </AuthPageShell>
  )
}
