import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push })
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    throw new Error('Supabase not configured')
  }
}))

import { SignUpForm } from '../sign-up-form'

describe('SignUpForm', () => {
  it('shows a contained error when authentication is not configured', async () => {
    render(<SignUpForm />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'reader@example.com' }
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secure-password' }
    })
    fireEvent.change(screen.getByLabelText('Repeat password'), {
      target: { value: 'secure-password' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('Supabase not configured')).toBeVisible()
    expect(push).not.toHaveBeenCalled()
  })
})
