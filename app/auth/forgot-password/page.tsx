import { AuthPageShell } from '@/components/auth/auth-page-shell'
import { ForgotPasswordForm } from '@/components/forgot-password-form'

export default function Page() {
  return (
    <AuthPageShell
      title="Reset access."
      description="We will send a secure reset link to the email connected to your gist account."
    >
      <ForgotPasswordForm />
    </AuthPageShell>
  )
}
