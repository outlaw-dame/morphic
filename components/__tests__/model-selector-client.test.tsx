import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ModelSelectorClient } from '../model-selector-client'

describe('ModelSelectorClient', () => {
  it('adopts a newly available server-selected model after refresh', () => {
    const { rerender } = render(
      <ModelSelectorClient
        data={{
          enabled: true,
          modelsByProvider: {},
          selectedModelKey: '',
          hasAvailableModels: false
        }}
      />
    )

    expect(screen.getByText('No enabled model available')).toBeInTheDocument()

    rerender(
      <ModelSelectorClient
        data={{
          enabled: true,
          modelsByProvider: {
            'Ollama Cloud': [
              {
                id: 'gpt-oss:20b',
                name: 'gpt-oss:20b',
                provider: 'Ollama Cloud',
                providerId: 'ollama-cloud'
              }
            ]
          },
          selectedModelKey: 'ollama-cloud:gpt-oss:20b',
          hasAvailableModels: true
        }}
      />
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('gpt-oss:20b')
  })
})
