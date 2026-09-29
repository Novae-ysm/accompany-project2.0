import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const app = express()
const port = 3001
const execAsync = promisify(exec)

app.use(cors())
app.use(express.json())
app.use('/audio', express.static(path.join(process.cwd(), 'audio')))

const statsFile = path.join(process.cwd(), 'data', 'stats.json')

function loadStats(): any[] {
  try {
    if (!fs.existsSync(statsFile)) return []
    return JSON.parse(fs.readFileSync(statsFile, 'utf-8'))
  } catch {
    return []
  }
}

function appendStat(entry: any) {
  const stats = loadStats()
  stats.push(entry)
  const trimmed = stats.slice(-2000)
  fs.mkdirSync(path.dirname(statsFile), { recursive: true })
  fs.writeFileSync(statsFile, JSON.stringify(trimmed, null, 2))
}

app.post('/chat', async (req, res) => {
  const startTime = Date.now()
  const { messages, settings, characterName, promptVersion } = req.body

  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages must be an array' })
  }

  const apiKey = settings?.apiKey || process.env.LLM_API_KEY
  const baseUrl = settings?.baseUrl || process.env.LLM_BASE_URL
  const model = settings?.model || process.env.LLM_MODEL || 'deepseek-chat'

  if (!apiKey || !baseUrl) {
    return res.status(500).json({ error: 'Missing LLM API configuration' })
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.8,
      }),
    })

    const latency = Date.now() - startTime

    if (!response.ok) {
      const errorText = await response.text()
      appendStat({
        time: Date.now(),
        model,
        characterName: characterName || 'unknown',
        promptVersion: promptVersion || 'v1',
        promptTokens: 0,
        completionTokens: 0,
        latency,
        success: false,
        error: errorText.slice(0, 200),
      })
      return res.status(500).json({ error: errorText })
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content ?? ''
    const usage = data.usage ?? {}

    appendStat({
      time: Date.now(),
      model,
      characterName: characterName || 'unknown',
      promptVersion: promptVersion || 'v1',
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
      latency,
      success: true,
    })

    res.json({ reply })
  } catch (error) {
    const latency = Date.now() - startTime
    appendStat({
      time: Date.now(),
      model,
      characterName: characterName || 'unknown',
      promptVersion: promptVersion || 'v1',
      promptTokens: 0,
      completionTokens: 0,
      latency,
      success: false,
      error: String(error).slice(0, 200),
    })
    res.status(500).json({ error: 'Request failed' })
  }
})

app.get('/stats', (req, res) => {
  const stats = loadStats()
  const total = stats.length
  const success = stats.filter((s) => s.success).length
  const fail = total - success

  const totalPromptTokens = stats.reduce((sum, s) => sum + (s.promptTokens || 0), 0)
  const totalCompletionTokens = stats.reduce((sum, s) => sum + (s.completionTokens || 0), 0)

  const avgLatency = total
    ? Math.round(stats.reduce((sum, s) => sum + (s.latency || 0), 0) / total)
    : 0

  const today = new Date().setHours(0, 0, 0, 0)
  const todayStats = stats.filter((s) => s.time >= today)

  const todayPromptTokens = todayStats.reduce((sum, s) => sum + (s.promptTokens || 0), 0)
  const todayCompletionTokens = todayStats.reduce((sum, s) => sum + (s.completionTokens || 0), 0)

  const modelCount: Record<string, number> = {}
  stats.forEach((s) => {
    modelCount[s.model] = (modelCount[s.model] || 0) + 1
  })

  const characterStats: Record<
    string,
    { count: number; promptTokens: number; completionTokens: number }
  > = {}
  stats.forEach((s) => {
    const name = s.characterName || 'unknown'
    if (!characterStats[name]) {
      characterStats[name] = { count: 0, promptTokens: 0, completionTokens: 0 }
    }
    characterStats[name].count += 1
    characterStats[name].promptTokens += s.promptTokens || 0
    characterStats[name].completionTokens += s.completionTokens || 0
  })

  const versionStats: Record<
    string,
    {
      count: number
      avgLatency: number
      totalLatency: number
      promptTokens: number
      completionTokens: number
    }
  > = {}

  stats.forEach((s) => {
    const version = s.promptVersion || 'v1'
    if (!versionStats[version]) {
      versionStats[version] = {
        count: 0,
        avgLatency: 0,
        totalLatency: 0,
        promptTokens: 0,
        completionTokens: 0,
      }
    }
    versionStats[version].count += 1
    versionStats[version].totalLatency += s.latency || 0
    versionStats[version].promptTokens += s.promptTokens || 0
    versionStats[version].completionTokens += s.completionTokens || 0
  })

  Object.keys(versionStats).forEach((key) => {
    versionStats[key].avgLatency = Math.round(
      versionStats[key].totalLatency / versionStats[key].count
    )
  })

  res.json({
    total,
    success,
    fail,
    failureRate: total ? Number(((fail / total) * 100).toFixed(1)) : 0,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens: totalPromptTokens + totalCompletionTokens,
    avgLatency,
    todayCount: todayStats.length,
    todayPromptTokens,
    todayCompletionTokens,
    todayTokens: todayPromptTokens + todayCompletionTokens,
    modelCount,
    characterStats,
    versionStats,
    recent: stats.slice(-20).reverse(),
  })
})

app.post('/stats/clear', (req, res) => {
  try {
    fs.mkdirSync(path.dirname(statsFile), { recursive: true })
    fs.writeFileSync(statsFile, JSON.stringify([]))
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Failed to clear stats' })
  }
})

app.post('/tts', async (req, res) => {
  const { text } = req.body

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' })
  }

  const cleanText = text
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[#*_~`>]/g, '')
    .replace(/["\\]/g, '')
    .trim()

  if (!cleanText) {
    return res.status(400).json({ error: 'empty text after cleaning' })
  }

  const fileName = 'current-tts.mp3'
  const audioDir = path.join(process.cwd(), 'audio')
  const filePath = path.join(audioDir, fileName)

  fs.mkdirSync(audioDir, { recursive: true })

  const safeText = cleanText.replace(/'/g, "'\\''")
  const command = `python3 -m edge_tts --voice zh-CN-YunxiNeural --rate=-3% --pitch=-2Hz --text '${safeText}' --write-media ${filePath}`

  try {
    await execAsync(command)
    res.json({ url: `http://localhost:3001/audio/${fileName}` })
  } catch (error) {
    console.error('TTS error:', error)
    res.status(500).json({ error: 'TTS failed' })
  }
})

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})