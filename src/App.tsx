import { useEffect, useMemo, useRef, useState } from 'react'
import ScenePanel from './components/ScenePanel'
import ChatWindow from './components/ChatWindow'
import InputBar from './components/InputBar'
import AssetLibrary from './components/AssetLibrary'
import {
  loadMessages,
  saveMessages,
  clearMessages,
  type ChatMessage,
} from './lib/storage'
import { sendChat, getStats, clearStats, type StatsData } from './lib/api'
import { type ThemeId } from './themes'
import { translations, type Language } from './i18n'
import {
  loadCharacterCards,
  saveCustomCharacterCards,
  type CharacterCard,
} from './characterCards'
import type { ProfileFields } from './types'
import { speakText, startSpeechRecognition, stopSpeechRecognition } from './voice'
import {
  createAsset,
  fileToDataUrl,
  loadCharacterImages,
  loadBackgroundImages,
  saveCharacterImages,
  saveBackgroundImages,
  type CustomAsset,
} from './lib/assets'
import {
  buildPromptByVersion,
  promptVersions,
  type PromptVersion,
} from './promptTemplates'

type LLMSettings = {
  apiKey: string
  baseUrl: string
  model: string
}

type SettingsTab = 'api' | 'prompt' | 'stats'
type ContextStrategy = 'full' | 'window'

const SETTINGS_KEY = 'llmSettings'

export default function App() {
  const [cards, setCards] = useState<CharacterCard[]>(() => loadCharacterCards())

  const [currentCharacterName, setCurrentCharacterName] = useState<string>(() => {
    return cards[0]?.profile.name ?? 'default'
  })

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return loadMessages(currentCharacterName)
  })

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [typingText, setTypingText] = useState('')
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null)

  const [backgroundOptions, setBackgroundOptions] = useState<string[]>([])
  const [characterOptions, setCharacterOptions] = useState<string[]>([])

  const [backgroundAssets, setBackgroundAssets] = useState<CustomAsset[]>(() => loadBackgroundImages())
  const [characterAssets, setCharacterAssets] = useState<CustomAsset[]>(() => loadCharacterImages())

  const [sceneIndex, setSceneIndex] = useState(0)
  const [characterIndex, setCharacterIndex] = useState(0)
  const [showProfileEditor, setShowProfileEditor] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('api')
  const [statsData, setStatsData] = useState<StatsData | null>(null)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [listening, setListening] = useState(false)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)

  const [promptVersion, setPromptVersion] = useState<PromptVersion>(() => {
    const saved = localStorage.getItem('promptVersion') as PromptVersion | null
    return saved ?? 'v1'
  })

  const [contextStrategy, setContextStrategy] = useState<ContextStrategy>(() => {
    const saved = localStorage.getItem('contextStrategy')
    return saved === 'window' ? 'window' : 'full'
  })

  const [windowSize, setWindowSize] = useState<number>(() => {
    const saved = localStorage.getItem('windowSize')
    return saved ? Number(saved) : 6
  })

  const [llmSettings, setLlmSettings] = useState<LLMSettings>(() => {
    const saved = localStorage.getItem(SETTINGS_KEY)
    if (!saved) return { apiKey: '', baseUrl: '', model: '' }
    try {
      return JSON.parse(saved) as LLMSettings
    } catch {
      return { apiKey: '', baseUrl: '', model: '' }
    }
  })

  const [theme, setTheme] = useState<ThemeId>(() => {
    const saved = localStorage.getItem('theme') as ThemeId | null
    const validThemes: ThemeId[] = ['warm', 'purple', 'rose', 'warmpink', 'mist']
    return saved && validThemes.includes(saved) ? saved : 'warm'
  })

  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('language') as Language | null
    return saved ?? 'zh'
  })

  const [profile, setProfile] = useState<ProfileFields>(() => {
    return cards[0]?.profile ?? {
      name: '',
      occupation: '',
      personality: '',
      speechStyle: '',
      careStyle: '',
      relationship: '',
      extra: '',
    }
  })

  const inputRef = useRef<HTMLInputElement>(null)
  const chatWindowRef = useRef<HTMLDivElement>(null)

  const systemPrompt = useMemo(
    () => buildPromptByVersion(promptVersion, profile),
    [promptVersion, profile]
  )

  const t = translations[language]

  const currentBackgroundImage = backgroundOptions[sceneIndex] ?? ''
  const currentCharacterImage = characterOptions[characterIndex] ?? ''

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('language', language)
  }, [language])

  useEffect(() => {
    localStorage.setItem('promptVersion', promptVersion)
  }, [promptVersion])

  useEffect(() => {
    localStorage.setItem('contextStrategy', contextStrategy)
  }, [contextStrategy])

  useEffect(() => {
    localStorage.setItem('windowSize', String(windowSize))
  }, [windowSize])

  useEffect(() => {
    chatWindowRef.current?.scrollTo({
      top: chatWindowRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, typingText])

  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'assistant') return

    setTypingMessageId(lastMessage.id)
    setTypingText('')

    let index = 0
    const timer = window.setInterval(() => {
      index += 1
      setTypingText(lastMessage.content.slice(0, index))

      if (index >= lastMessage.content.length) {
        window.clearInterval(timer)
        setTypingMessageId(null)
      }
    }, 25)

    return () => window.clearInterval(timer)
  }, [messages])

  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'assistant') return
    speakText(lastMessage.content, voiceEnabled)
  }, [messages, voiceEnabled])

  async function handleSend() {
    const content = input.trim()
    if (!content || sending) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: Date.now(),
    }

    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    saveMessages(currentCharacterName, nextMessages)
    setInput('')
    setSending(true)

    const historyToSend =
      contextStrategy === 'window'
        ? nextMessages.slice(-windowSize)
        : nextMessages

    try {
      const reply = await sendChat(
        [
          { role: 'system', content: systemPrompt },
          ...historyToSend.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
        llmSettings,
        currentCharacterName,
        promptVersion
      )

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
        createdAt: Date.now(),
      }

      setMessages((current) => {
        const updated = [...current, assistantMessage]
        saveMessages(currentCharacterName, updated)
        return updated
      })
    } catch {
      const fallbackMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, I could not reach the AI service right now.',
        createdAt: Date.now(),
      }

      setMessages((current) => {
        const updated = [...current, fallbackMessage]
        saveMessages(currentCharacterName, updated)
        return updated
      })
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function updateProfileField(key: keyof ProfileFields, value: string) {
    setProfile((prev) => ({ ...prev, [key]: value }))
  }

  function handleNewCharacter() {
    setProfile({
      name: '',
      occupation: '',
      personality: '',
      speechStyle: '',
      careStyle: '',
      relationship: '',
      extra: '',
    })
  }

  function handleSelectCharacter(card: CharacterCard) {
    setProfile(card.profile)
    setCurrentCharacterName(card.profile.name)
    setMessages(loadMessages(card.profile.name))
    setShowProfileEditor(false)
  }

  function handleEditCharacter(card: CharacterCard) {
    setProfile(card.profile)
    setShowProfileEditor(true)
  }

  function handleSaveProfile() {
    localStorage.setItem('profileFields', JSON.stringify(profile))
    setShowProfileEditor(false)

    const nextName = profile.name.trim()
    if (!nextName) return

    clearMessages(currentCharacterName)
    setMessages([])
    setCurrentCharacterName(nextName)

    const existingCard = cards.find((card) => card.name === nextName)

    if (existingCard) {
      const nextCards = cards.map((card) =>
        card.name === nextName ? { ...card, profile } : card
      )
      setCards(nextCards)
      saveCustomCharacterCards(nextCards)
    } else {
      const newCard: CharacterCard = {
        id: crypto.randomUUID(),
        name: nextName,
        profile,
      }

      const nextCards = [...cards, newCard]
      setCards(nextCards)
      saveCustomCharacterCards(nextCards)
    }
  }

  function handleVoiceInput() {
    if (listening) {
      stopSpeechRecognition()
      setListening(false)
      return
    }

    setListening(true)
    startSpeechRecognition(
      (text) => {
        setInput(text)
        inputRef.current?.focus()
      },
      () => setListening(false)
    )
  }

  async function handleUploadCharacter(file: File) {
    const dataUrl = await fileToDataUrl(file)
    const asset = createAsset(file.name, dataUrl)
    const next = [...characterAssets, asset]
    setCharacterAssets(next)
    saveCharacterImages(next)

    const nextOptions = [...characterOptions, dataUrl]
    setCharacterOptions(nextOptions)
    setCharacterIndex(nextOptions.length - 1)
  }

  async function handleUploadBackground(file: File) {
    const dataUrl = await fileToDataUrl(file)
    const asset = createAsset(file.name, dataUrl)
    const next = [...backgroundAssets, asset]
    setBackgroundAssets(next)
    saveBackgroundImages(next)

    const nextOptions = [...backgroundOptions, dataUrl]
    setBackgroundOptions(nextOptions)
    setSceneIndex(nextOptions.length - 1)
  }

  function handleDeleteCharacter(id: string) {
    const asset = characterAssets.find((item) => item.id === id)
    if (!asset) return

    const next = characterAssets.filter((item) => item.id !== id)
    setCharacterAssets(next)
    saveCharacterImages(next)
    setCharacterOptions((prev) => prev.filter((img) => img !== asset.dataUrl))
  }

  function handleDeleteBackground(id: string) {
    const asset = backgroundAssets.find((item) => item.id === id)
    if (!asset) return

    const next = backgroundAssets.filter((item) => item.id !== id)
    setBackgroundAssets(next)
    saveBackgroundImages(next)
    setBackgroundOptions((prev) => prev.filter((img) => img !== asset.dataUrl))
  }

  function handleSaveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(llmSettings))
    setShowSettings(false)
  }

  async function handleOpenSettings() {
    setShowSettings(true)
    setSettingsTab('api')
    try {
      const data = await getStats()
      setStatsData(data)
    } catch {
      setStatsData(null)
    }
  }

  async function handleClearStats() {
    try {
      await clearStats()
      const data = await getStats()
      setStatsData(data)
    } catch {
      setStatsData(null)
    }
  }

  return (
    <>
      <div className="app">
        <main className="app-shell">
          <ScenePanel
            backgroundImage={currentBackgroundImage}
            characterImage={currentCharacterImage}
            replyText={
              typingMessageId === messages[messages.length - 1]?.id
                ? typingText
                : messages[messages.length - 1]?.role === 'assistant'
                  ? messages[messages.length - 1].content
                  : ''
            }
            isTyping={typingMessageId !== null}
            voiceEnabled={voiceEnabled}
            onToggleVoice={() => {
              setVoiceEnabled((prev) => {
                const next = !prev
                if (!next) {
                  stopSpeechRecognition()
                }
                return next
              })
            }}
            t={t}
          />

          <section className="chat-panel">
            <div className="chat-window" ref={chatWindowRef}>
              <ChatWindow
                messages={messages.filter((message) => message.role === 'user')}
                typingMessageId={null}
                typingText=""
              />
            </div>

            <InputBar
              input={input}
              sending={sending}
              onChange={setInput}
              onSend={handleSend}
              onOpenProfile={() => setShowProfileEditor(true)}
              onOpenHistory={() => setShowHistory(true)}
              onOpenSettings={handleOpenSettings}
              theme={theme}
              onChangeTheme={setTheme}
              language={language}
              onToggleLanguage={() =>
                setLanguage((prev) => (prev === 'zh' ? 'en' : 'zh'))
              }
              t={t}
              listening={listening}
              onVoiceInput={handleVoiceInput}
            />
          </section>
        </main>
      </div>

      {leftPanelOpen && (
        <AssetLibrary
          side="left"
          title="立绘库"
          accept="image/png"
          assets={characterAssets}
          currentImage={currentCharacterImage}
          onSelect={(asset) => {
            const next = [...characterOptions]
            next[characterIndex] = asset.dataUrl
            setCharacterOptions(next)
          }}
          onUpload={handleUploadCharacter}
          onDelete={handleDeleteCharacter}
        />
      )}

      {rightPanelOpen && (
        <AssetLibrary
          side="right"
          title="背景库"
          accept="image/*"
          assets={backgroundAssets}
          currentImage={currentBackgroundImage}
          onSelect={(asset) => {
            const next = [...backgroundOptions]
            next[sceneIndex] = asset.dataUrl
            setBackgroundOptions(next)
          }}
          onUpload={handleUploadBackground}
          onDelete={handleDeleteBackground}
        />
      )}

      <button
        type="button"
        className="panel-toggle panel-toggle-left"
        onClick={() => setLeftPanelOpen((prev) => !prev)}
      >
        {leftPanelOpen ? '⟨' : '⟩'}
      </button>

      <button
        type="button"
        className="panel-toggle panel-toggle-right"
        onClick={() => setRightPanelOpen((prev) => !prev)}
      >
        {rightPanelOpen ? '⟩' : '⟨'}
      </button>

      {showSettings && (
        <div className="settings-modal">
          <div className="settings-modal-inner">
            <div className="settings-modal-header">
              <h3>{t.settings}</h3>
              <button
                type="button"
                className="settings-close"
                onClick={() => setShowSettings(false)}
              >
                ×
              </button>
            </div>

            <div className="settings-tabs">
              <button
                type="button"
                className={`settings-tab ${settingsTab === 'api' ? 'settings-tab-active' : ''}`}
                onClick={() => setSettingsTab('api')}
              >
                API
              </button>
              <button
                type="button"
                className={`settings-tab ${settingsTab === 'prompt' ? 'settings-tab-active' : ''}`}
                onClick={() => setSettingsTab('prompt')}
              >
                Prompt
              </button>
              <button
                type="button"
                className={`settings-tab ${settingsTab === 'stats' ? 'settings-tab-active' : ''}`}
                onClick={() => setSettingsTab('stats')}
              >
                {t.statsTitle}
              </button>
            </div>

            <div className="settings-content">
              {settingsTab === 'api' && (
                <div className="settings-form">
                  <label>
                    API Key
                    <input
                      type="password"
                      value={llmSettings.apiKey}
                      onChange={(event) =>
                        setLlmSettings((prev) => ({ ...prev, apiKey: event.target.value }))
                      }
                    />
                  </label>

                  <label>
                    Base URL
                    <input
                      value={llmSettings.baseUrl}
                      onChange={(event) =>
                        setLlmSettings((prev) => ({ ...prev, baseUrl: event.target.value }))
                      }
                    />
                  </label>

                  <label>
                    Model
                    <input
                      value={llmSettings.model}
                      onChange={(event) =>
                        setLlmSettings((prev) => ({ ...prev, model: event.target.value }))
                      }
                    />
                  </label>
                </div>
              )}

              {settingsTab === 'prompt' && (
                <div className="settings-form">
                  <label>
                    Prompt Version
                    <select
                      value={promptVersion}
                      onChange={(event) =>
                        setPromptVersion(event.target.value as PromptVersion)
                      }
                    >
                      {promptVersions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    上下文策略
                    <select
                      value={contextStrategy}
                      onChange={(event) =>
                        setContextStrategy(event.target.value as ContextStrategy)
                      }
                    >
                      <option value="full">全量</option>
                      <option value="window">滑动窗口</option>
                    </select>
                  </label>

                  {contextStrategy === 'window' && (
                    <label>
                      窗口大小（消息条数）
                      <input
                        type="number"
                        min={2}
                        max={50}
                        value={windowSize}
                        onChange={(event) => setWindowSize(Number(event.target.value))}
                      />
                    </label>
                  )}
                </div>
              )}

              {settingsTab === 'stats' && (
                <>
                  {!statsData ? (
                    <p style={{ color: 'var(--text-soft)' }}>—</p>
                  ) : (
                    <div className="stats-content">
                      <div className="stats-grid">
                        <div className="stats-item">
                          <span>{t.totalCalls}</span>
                          <strong>{statsData.total}</strong>
                        </div>
                        <div className="stats-item">
                          <span>{t.todayCalls}</span>
                          <strong>{statsData.todayCount}</strong>
                        </div>
                        <div className="stats-item">
                          <span>{t.avgLatency}</span>
                          <strong>{statsData.avgLatency} ms</strong>
                        </div>
                        <div className="stats-item">
                          <span>{t.failureRate}</span>
                          <strong>{statsData.failureRate}%</strong>
                        </div>
                        <div className="stats-item">
                          <span>{t.totalTokens}</span>
                          <strong>{statsData.totalTokens}</strong>
                        </div>
                        <div className="stats-item">
                          <span>{t.promptTokens}</span>
                          <strong>{statsData.totalPromptTokens}</strong>
                        </div>
                        <div className="stats-item">
                          <span>{t.completionTokens}</span>
                          <strong>{statsData.totalCompletionTokens}</strong>
                        </div>
                      </div>

                      <h4>{t.characterUsage}</h4>
                      <ul className="stats-list">
                        {Object.entries(statsData.characterStats).map(([name, info]) => (
                          <li key={name}>
                            <span>{name}</span>
                            <span>
                              {info.count} 次 · 输入 {info.promptTokens} · 输出 {info.completionTokens}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <h4>{t.versionUsage}</h4>
                      <ul className="stats-list">
                        {Object.entries(statsData.versionStats).map(([version, info]) => (
                          <li key={version}>
                            <span>{version}</span>
                            <span>
                              {info.count} 次 · 输入 {info.promptTokens ?? 0} · 输出 {info.completionTokens ?? 0} · 平均 {info.avgLatency}ms
                            </span>
                          </li>
                        ))}
                      </ul>

                      <h4>{t.modelUsage}</h4>
                      <ul className="stats-list">
                        {Object.entries(statsData.modelCount).map(([model, count]) => (
                          <li key={model}>
                            <span>{model}</span>
                            <span>{count}</span>
                          </li>
                        ))}
                      </ul>

                      <h4>{t.recentRequests}</h4>
                      <ul className="stats-list">
                        {statsData.recent.map((item, index) => (
                          <li key={index}>
                            <span>
                              {new Date(item.time).toLocaleTimeString()} · {item.characterName} · {item.model}
                            </span>
                            <span>
                              {item.latency}ms · 入 {item.promptTokens} 出 {item.completionTokens}
                              {item.success ? '' : ' ✗'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="profile-editor-actions">
                    <button type="button" onClick={handleClearStats}>
                      {t.clearStats}
                    </button>
                  </div>
                </>
              )}
            </div>

            {settingsTab !== 'stats' && (
              <div className="profile-editor-actions">
                <button type="button" onClick={() => setShowSettings(false)}>
                  {t.cancel}
                </button>
                <button type="button" onClick={handleSaveSettings}>
                  {t.save}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showProfileEditor && (
        <div className="profile-editor">
          <div className="profile-editor-inner">
            <h3>{t.characterProfile}</h3>

            <div className="character-cards">
              {cards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className="character-card"
                  onClick={() => handleSelectCharacter(card)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    handleEditCharacter(card)
                  }}
                >
                  {card.name}
                </button>
              ))}

              <button
                type="button"
                className="character-card new-character-card"
                onClick={handleNewCharacter}
              >
                + New
              </button>
            </div>

            <div className="profile-form">
              <label>
                {t.name}
                <input
                  value={profile.name}
                  onChange={(event) => updateProfileField('name', event.target.value)}
                />
              </label>

              <label>
                {t.occupation}
                <input
                  value={profile.occupation}
                  onChange={(event) => updateProfileField('occupation', event.target.value)}
                />
              </label>

              <label>
                {t.personality}
                <textarea
                  rows={2}
                  value={profile.personality}
                  onChange={(event) => updateProfileField('personality', event.target.value)}
                />
              </label>

              <label>
                {t.speechStyle}
                <textarea
                  rows={2}
                  value={profile.speechStyle}
                  onChange={(event) => updateProfileField('speechStyle', event.target.value)}
                />
              </label>

              <label>
                {t.careStyle}
                <textarea
                  rows={2}
                  value={profile.careStyle}
                  onChange={(event) => updateProfileField('careStyle', event.target.value)}
                />
              </label>

              <label>
                {t.relationship}
                <input
                  value={profile.relationship}
                  onChange={(event) => updateProfileField('relationship', event.target.value)}
                />
              </label>

              <label>
                {t.extra}
                <textarea
                  rows={4}
                  placeholder={t.extraPlaceholder}
                  value={profile.extra}
                  onChange={(event) => updateProfileField('extra', event.target.value)}
                />
              </label>
            </div>

            <div className="profile-editor-actions">
              <button type="button" onClick={() => setShowProfileEditor(false)}>
                {t.cancel}
              </button>
              <button type="button" onClick={handleSaveProfile}>
                {t.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="history-modal">
          <div className="history-modal-inner">
            <h3>{t.history}</h3>

            <div className="history-list">
              {messages.length === 0 && <p>{t.emptyHistory}</p>}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`history-message history-${message.role}`}
                >
                  <div className="history-message-role">
                    {message.role === 'user' ? t.me : profile.name}
                  </div>
                  <div className="history-message-content">{message.content}</div>
                </div>
              ))}
            </div>

            <div className="profile-editor-actions">
              <button type="button" onClick={() => setShowHistory(false)}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}