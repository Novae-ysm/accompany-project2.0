type LLMSettings = {
  apiKey: string
  baseUrl: string
  model: string
}

export async function sendChat(
  messages: { role: string; content: string }[],
  settings?: LLMSettings,
  characterName?: string,
  promptVersion?: string
) {
  const response = await fetch('http://localhost:3001/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      settings,
      characterName,
      promptVersion,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to get AI response')
  }

  const data = await response.json()
  return data.reply as string
}

export async function getTTSAudio(text: string): Promise<string> {
  const response = await fetch('http://localhost:3001/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })

  if (!response.ok) {
    throw new Error('Failed to get TTS audio')
  }

  const data = await response.json()
  return `${data.url}?t=${Date.now()}`
}

export type StatsData = {
  total: number
  success: number
  fail: number
  failureRate: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  avgLatency: number
  todayCount: number
  todayPromptTokens: number
  todayCompletionTokens: number
  todayTokens: number
  modelCount: Record<string, number>
  characterStats: Record<
    string,
    { count: number; promptTokens: number; completionTokens: number }
  >
  versionStats: Record<
    string,
    {
      count: number
      avgLatency: number
      totalLatency: number
      promptTokens: number
      completionTokens: number
    }
  >
  recent: {
    time: number
    model: string
    characterName: string
    promptVersion: string
    promptTokens: number
    completionTokens: number
    latency: number
    success: boolean
    error?: string
  }[]
}

export async function getStats(): Promise<StatsData> {
  const response = await fetch('http://localhost:3001/stats')
  if (!response.ok) {
    throw new Error('Failed to get stats')
  }
  return response.json()
}

export async function clearStats(): Promise<void> {
  const response = await fetch('http://localhost:3001/stats/clear', {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('Failed to clear stats')
  }
}