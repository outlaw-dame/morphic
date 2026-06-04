import { z } from 'zod'

export const wolframAlphaSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      'A natural-language or mathematical Wolfram|Alpha query, such as "integrate sin(x)^2", "atomic weight of gold", or "distance from NYC to LA".'
    ),
  mode: z
    .enum(['full', 'short'])
    .optional()
    .default('full')
    .describe(
      'Use "full" for structured pods and richer computational context. Use "short" for a single concise plaintext answer.'
    ),
  units: z
    .enum(['metric', 'imperial', 'nonmetric'])
    .optional()
    .describe(
      'Optional unit system. "metric" uses metric units. "imperial" and "nonmetric" use US customary/nonmetric units where supported.'
    ),
  location: z
    .string()
    .optional()
    .describe(
      'Optional semantic location for location-sensitive full-result queries, e.g. "Chicago, IL".'
    )
})

export type WolframAlphaSchema = z.infer<typeof wolframAlphaSchema>
