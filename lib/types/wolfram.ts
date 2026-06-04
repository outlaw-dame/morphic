export interface WolframPod {
  id: string
  title: string
  primary: boolean
  plaintext: string[]
}

export interface WolframSource {
  text: string
  url: string
}

export interface WolframAlphaResult {
  state: 'complete'
  query: string
  mode: 'short' | 'full'
  answer?: string
  pods: WolframPod[]
  sources: WolframSource[]
  assumptions: string[]
  didYouMeans: string[]
  warnings: string[]
  url: string
}
