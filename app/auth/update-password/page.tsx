import { AuthPageShell } from '@/components/auth/auth-page-shell'
import { UpdatePasswordForm } from '@/components/update-password-form'

export default function Page() {
  return (
    <AuthPageShell
      title="Choose a new password."
      description="Use a password you do not use elsewhere, then continue back to search."
    >
      <UpdatePasswordForm />
    </AuthPageShell>
  )
}
