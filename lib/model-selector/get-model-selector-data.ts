import { cookies } from 'next/headers'

import { DEFAULT_MODEL } from '@/lib/config/default-model'
import {
  MODEL_SELECTION_COOKIE,
  parseModelSelectionCookie
} from '@/lib/config/model-selection-cookie'
import {
  getSearchModelPreferenceScore,
  isSearchCompatibleModel
} from '@/lib/models/compatibility'
import { fetchAvailableModels } from '@/lib/models/fetch-models'
import { ModelSelectorData } from '@/lib/types/model-selector'
import { Model } from '@/lib/types/models'
import { isProviderEnabled } from '@/lib/utils/registry'

import 'server-only'

function modelKey(model: Model): string {
  return `${model.providerId}:${model.id}`
}

function pickFirstAvailableModel(
  modelsByProvider: Record<string, Model[]>
): Model | null {
  const providers = Object.keys(modelsByProvider).sort((a, b) =>
    a.localeCompare(b)
  )

  for (const provider of providers) {
    const firstModel = [...(modelsByProvider[provider] ?? [])]
      .sort(
        (a, b) =>
          getSearchModelPreferenceScore(a.providerId, a.id) -
          getSearchModelPreferenceScore(b.providerId, b.id)
      )
      .find(model => isSearchCompatibleModel(model.providerId, model.id))
    if (firstModel) {
      return firstModel
    }
  }

  return null
}

function resolveSelectedModelKey(
  modelsByProvider: Record<string, Model[]>,
  fallbackModel: Model | null,
  cookieValue?: string
): string {
  const parsedCookie = parseModelSelectionCookie(cookieValue)
  if (!parsedCookie) {
    return fallbackModel ? modelKey(fallbackModel) : ''
  }

  const matched = Object.values(modelsByProvider)
    .flat()
    .some(
      model =>
        model.providerId === parsedCookie.providerId &&
        model.id === parsedCookie.modelId &&
        isSearchCompatibleModel(model.providerId, model.id)
    )

  return matched
    ? `${parsedCookie.providerId}:${parsedCookie.modelId}`
    : fallbackModel
      ? modelKey(fallbackModel)
      : ''
}

function ensureEnabledDefaultModel(
  modelsByProvider: Record<string, Model[]>,
  cookieStore: Awaited<ReturnType<typeof cookies>>
): Record<string, Model[]> {
  if (!isProviderEnabled(DEFAULT_MODEL.providerId, cookieStore)) {
    return modelsByProvider
  }

  const hasDefaultModel = Object.values(modelsByProvider)
    .flat()
    .some(
      model =>
        model.providerId === DEFAULT_MODEL.providerId &&
        model.id === DEFAULT_MODEL.id &&
        isSearchCompatibleModel(model.providerId, model.id)
    )

  if (hasDefaultModel) {
    return modelsByProvider
  }

  return {
    ...modelsByProvider,
    [DEFAULT_MODEL.provider]: [
      ...(modelsByProvider[DEFAULT_MODEL.provider] ?? []),
      DEFAULT_MODEL
    ]
  }
}

export async function getModelSelectorData(): Promise<ModelSelectorData> {
  if (process.env.MORPHIC_CLOUD_DEPLOYMENT === 'true') {
    return {
      enabled: false,
      modelsByProvider: {},
      selectedModelKey: '',
      hasAvailableModels: false
    }
  }

  const cookieStore = await cookies()
  const modelsByProvider = ensureEnabledDefaultModel(
    await fetchAvailableModels(),
    cookieStore
  )
  const fallbackModel = pickFirstAvailableModel(modelsByProvider)
  const hasAvailableModels = fallbackModel !== null
  const selectedModelKey = resolveSelectedModelKey(
    modelsByProvider,
    fallbackModel,
    cookieStore.get(MODEL_SELECTION_COOKIE)?.value
  )

  return {
    enabled: true,
    modelsByProvider,
    selectedModelKey,
    hasAvailableModels
  }
}
