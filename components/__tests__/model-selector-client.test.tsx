import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ChatBarOptions } from '../chat-bar-options'

describe('ChatBarOptions model selector', () => {
  it('adopts a newly available server-selected model after refresh', () => {
    const { rerender } = render(
      <ChatBarOptions
        modelSelectorData={{
          enabled: true,
          modelsByProvider: {},
          selectedModelKey: '',
          hasAvailableModels: false
        }}
        onFileSelect={() => {}}
      />
    )

    fireEvent.click(screen.getByLabelText('Open model and search options'))
    expect(screen.getByText('No enabled model available.')).toBeInTheDocument()

    rerender(
      <ChatBarOptions
        modelSelectorData={{
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
        onFileSelect={() => {}}
      />
    )

    expect(screen.getByText('gpt-oss:20b')).toBeInTheDocument()
  })
})
