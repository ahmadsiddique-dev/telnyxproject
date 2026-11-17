import { useEffect, useRef, useState, type FormEvent } from 'react'
import { hangUp, onCallUpdate, placeCall, stateLabel } from './phone'
import { AdminPage, Alert, AuthScreen, BillingPage, Dashboard, Empty, Loading, NumbersPage, PageHead, RecordingsPage, type SessionUser } from './desk'
import { BrandMark, Icon, WhatsAppMark } from './icons'

type CallRecord = {
  id: number
  direction: string | null
  from: string | null
  to: string | null
  status: string
  startedAt: string | null
  durationSeconds: number | null
  costAmount: string | null
  currency: string | null
}

type Chat = {
  jid: string
  displayName: string | null
  messageCount: number
  transcriptCount: number
  firstMessageAt: string
  lastMessageAt: string
  lastText: string
  summaryText: string | null
  summaryAt: string | null
  summaryMessageCount: number | null
  summaryStale: boolean
}

type Message = {
  id: number
  pushName: string | null
  body: string
  timestamp: string
  fromMe: boolean
}

type ReplyState = {
  enabled: boolean
  pattern: string
  exampleCount: number
  ready: boolean
  updatedAt: string | null
}

type WaLink = {
  connection: string
  qrDataUrl: string | null
  error: string | null
  type?: string
}

async function readJson<T>(response: Response): Promise<T> {
  let body: T & { error?: string }
  try {
    body = await response.json() as T & { error?: string }
  } catch {
    throw new Error('The API did not answer. Check that the server is running.')
  }
  if (!response.ok) throw new Error(body.error || 'Request failed.')
  return body
}

function minutes(seconds: number | null) {
  if (seconds == null) return '—'
  return `${(seconds / 60).toFixed(1)} min`
}

function money(amount: string | null, currency: string | null) {
  if (!amount) return 'Pending'
  return currency ? `${currency} ${Number(amount).toFixed(4)}` : Number(amount).toFixed(4)
}

function when(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function clock(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function normalizeNumber(input: string) {
  const digits = input.trim().replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return `+${digits}`
}

function chatLabel(chat: Chat) {
  return chat.displayName || chat.jid.replace(/@.*/, '')
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

const navItems = [
  { href: '#/', label: 'Dashboard', icon: 'dashboard' as const },
  { href: '#/calls', label: 'Calls', icon: 'calls' as const },
  { href: '#/numbers', label: 'Numbers', icon: 'numbers' as const },
  { href: '#/billing', label: 'Billing', icon: 'billing' as const },
]

export function App() {
  const route = useHash()
  const [me, setMe] = useState<SessionUser | null | undefined>(undefined)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    fetch('/api/auth/me').then(async (response) => {
      if (response.status === 401) {
        setMe(null)
        return
      }
      setMe(await readJson<SessionUser>(response))
    }).catch(() => setMe(null))
  }, [])

  useEffect(() => {
    if (me && me.role !== 'admin' && (route === '#/admin' || route === '#/whatsapp' || route === '#/recordings')) {
      window.location.hash = '#/'
    }
  }, [me, route])

  useEffect(() => {
    setMenuOpen(false)
  }, [route])

  useEffect(() => {
    if (me?.role !== 'admin') {
      setPending(0)
      return
    }
    fetch('/api/billing/requests')
      .then((response) => readJson<{ status: string }[]>(response))
      .then((rows) => setPending(rows.filter((row) => row.status === 'pending').length))
      .catch(() => undefined)
  }, [me, route])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  if (me === undefined) {
    return (
      <div className="boot">
        <BrandMark size={34} />
        <p className="loading" role="status">Loading the desk.</p>
      </div>
    )
  }

  if (!me) return <AuthScreen onSuccess={setMe} />

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setMe(null)
    window.location.hash = '#/'
  }

  const adminRoute = route === '#/admin' || route === '#/whatsapp' || route === '#/recordings'
  const page = adminRoute
    ? route === '#/whatsapp'
      ? <WhatsApp />
      : route === '#/recordings'
        ? <RecordingsPage />
        : <AdminPage />
    : route === '#/calls'
      ? <Calls />
      : route === '#/numbers'
        ? <NumbersPage />
        : route === '#/billing'
          ? <BillingPage />
          : <Dashboard />

  const sidebar = (
    <aside id="sidebar" className={`sidebar${menuOpen ? ' is-open' : ''}`}>
      <div className="brand-row">
        <a className="brand" href="#/" aria-label="Desk home">
          <BrandMark size={30} />
          <span>
            <span className="brand__name">Desk</span>
            <span className="brand__sub">Telnyx × Baileys</span>
          </span>
        </a>
        <button type="button" className="sidebar__close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
          <Icon name="close" size={18} />
        </button>
      </div>

      <nav className="nav" aria-label="Desk sections">
        <p className="nav__label">Workspace</p>
        {navItems.map((item) => (
          <a
            key={item.href}
            className="nav__item"
            href={item.href}
            aria-current={(route === item.href || (item.href === '#/' && (route === '' || route === '#/'))) ? 'page' : undefined}
          >
            <Icon name={item.icon} size={17} />
            {item.label}
          </a>
        ))}
        {me.role === 'admin' ? (
          <>
            <p className="nav__label">Admin</p>
            <a className="nav__item" href="#/admin" aria-current={route === '#/admin' ? 'page' : undefined}>
              <Icon name="admin" size={17} />
              Approvals
              {pending > 0 ? <span className="nav__badge">{pending}</span> : null}
            </a>
            <a className="nav__item" href="#/whatsapp" aria-current={route === '#/whatsapp' ? 'page' : undefined}>
              <WhatsAppMark size={16} />
              WhatsApp
            </a>
            <a className="nav__item" href="#/recordings" aria-current={route === '#/recordings' ? 'page' : undefined}>
              <Icon name="mic" size={17} />
              Recordings
            </a>
          </>
        ) : null}
      </nav>

      <div className="sidebar__foot">
        <div className="sidebar__user">
          <span className="avatar" aria-hidden="true">{initials(me.name)}</span>
          <span className="sidebar__who">
            <strong>{me.name}</strong>
            <span>{me.email}</span>
          </span>
        </div>
        <div className="sidebar__meta">
          <span>Desk 1.0</span>
          <span className="mono">SIP · WebRTC</span>
        </div>
        <button type="button" className="signout" onClick={signOut}>
          <Icon name="signout" size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <button
          type="button"
          className="topbar__menu"
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} size={18} />
        </button>
        <a className="brand" href="#/" aria-label="Desk home">
          <BrandMark size={26} />
          <span><span className="brand__name">Desk</span></span>
        </a>
      </header>

      {menuOpen ? <button type="button" className="scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}
      {sidebar}

      <div className="canvas">
        <div className="canvas__inner">
          <main id="main" tabIndex={-1}>{page}</main>
          <footer className="app-foot">
            <span>Desk · Telnyx voice and one Baileys line</span>
            <span className="mono">{me.role} · v1.0</span>
          </footer>
        </div>
      </div>
    </div>
  )
}

function useHash() {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

function callTone(status: string) {
  const value = status.toLowerCase()
  if (value === 'answered' || value === 'active') return 'ok'
  if (value === 'failed' || value === 'busy' || value === 'rejected') return 'bad'
  if (value === 'hangup' || value === 'ended') return 'plain'
  return 'warn'
}

function callStatusLabel(status: string) {
  const value = status.toLowerCase()
  if (value === 'hangup' || value === 'destroy' || value === 'purge') return 'Ended'
  if (value === 'initiated') return 'Dialing'
  if (value === 'answered') return 'Answered'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function Calls() {
  const [number, setNumber] = useState('')
  const [live, setLive] = useState<string | undefined>()
  const [cause, setCause] = useState('')
  const [active, setActive] = useState<{ hangup?: () => void, state?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [calls, setCalls] = useState<CallRecord[] | null>(null)
  const [refreshing, setRefreshing] = useState<number | null>(null)

  async function load() {
    const rows = await readJson<CallRecord[]>(await fetch('/api/calls'))
    setCalls(rows)
  }

  useEffect(() => {
    load().catch((reason: Error) => setError(reason.message))
    const stop = onCallUpdate((call) => {
      setLive(call.state)
      setCause(call.cause || call.hangupCause || '')
      setActive(call.state === 'destroy' || call.state === 'purge' ? null : call)
      load().catch(() => undefined)
    })
    return () => {
      stop()
    }
  }, [])

  async function dial(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const destination = normalizeNumber(number)
      if (!destination) throw new Error('Enter a phone number with at least 8 digits.')
      setLive('requesting')
      const call = await placeCall(destination)
      setActive(call)
    } catch (reason) {
      setLive(undefined)
      setError(reason instanceof Error ? reason.message : 'The call did not start.')
    } finally {
      setBusy(false)
    }
  }

  async function refresh(id: number) {
    setRefreshing(id)
    setError('')
    try {
      await readJson(await fetch(`/api/calls/${id}/refresh-cost`, { method: 'POST' }))
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Cost refresh failed.')
    } finally {
      setRefreshing(null)
    }
  }

  const onCall = live === 'active' || live === 'ringing' || live === 'early' || live === 'trying' || live === 'requesting' || live === 'answering' || live === 'held'
  const ended = live === 'hangup' || live === 'destroy' || live === 'purge' || live === 'failed'

  return (
    <div className="page">
      <PageHead
        eyebrow="Voice"
        title="Calls"
        lead="Dial from the browser over the Telnyx credential connection. The record keeps the minutes, status, and the cost Telnyx reports."
        actions={<span className="pill pill--plain">SIP · WebRTC</span>}
      />
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid-2--wide grid-2" style={{ marginBottom: 16 }}>
        <section className="panel dialer">
          <div className="panel__head">
            <h2>New call</h2>
            <span className="tag">outbound</span>
          </div>
          <form className="dialer__form" onSubmit={dial}>
            <label className="field">Number to dial
              <div className="dialer__row">
                <input
                  className="dialer__input"
                  id="number"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={number}
                  onChange={(event) => setNumber(event.target.value)}
                  placeholder="+1 415 555 1212"
                  aria-describedby="dial-hint"
                />
                <button type="submit" className="btn btn--primary" disabled={busy || onCall}>
                  <Icon name="calls" size={16} />
                  {busy ? 'Connecting' : 'Call'}
                </button>
                <button type="button" className="btn btn--danger" disabled={!active} onClick={() => hangUp(active)}>
                  Hang up
                </button>
              </div>
            </label>
            <p className="status-note" id="dial-hint">
              <Icon name="mic" size={14} />
              The browser asks for the microphone on the first call. Telnyx prices the call after it ends.
            </p>
          </form>
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2>Call status</h2>
            <span className="tag">{onCall ? 'live' : 'idle'}</span>
          </div>
          <div className={onCall ? 'call-state is-live' : 'call-state'} role="status" aria-live="polite">
            <span className="call-state__bars" aria-hidden="true">
              <span /><span /><span /><span /><span /><span />
            </span>
            <div>
              <p className="call-state__label">{busy && !live ? 'Connecting to Telnyx' : stateLabel(live)}</p>
              <p className="call-state__note">
                {onCall
                  ? 'Microphone is live. Hang up when the call ends.'
                  : ended && cause
                    ? `Telnyx said ${cause}. The record is saved below.`
                    : ended
                      ? 'Call ended. The record and its price are saved below.'
                      : 'Ready to dial. Caller ID is the number on the Telnyx connection.'}
              </p>
            </div>
          </div>
          <dl className="facts" style={{ marginTop: 14 }}>
            <div><dt>Carrier</dt><dd>Telnyx SIP</dd></div>
            <div><dt>Audio</dt><dd>WebRTC</dd></div>
          </dl>
        </section>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2>History <span className="panel__count">{calls?.length ?? 0}</span></h2>
          <span className="tag">newest first</span>
        </div>
        {calls == null ? (error ? (
          <Empty icon="calls" title="Calls did not load" body="The API did not answer. Reload once the server is back." />
        ) : <Loading label="Loading calls." />) : calls.length === 0 ? (
          <Empty
            icon="calls"
            title="No calls yet"
            body="Enter a number above and press Call. The record keeps the minutes, the status, and the Telnyx cost."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Direction</th>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col">Minutes</th>
                  <th scope="col">Cost</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Price</span></th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr key={call.id}>
                    <td className="mono">{when(call.startedAt)}</td>
                    <td>{call.direction ? call.direction.charAt(0).toUpperCase() + call.direction.slice(1) : '—'}</td>
                    <td className="mono">{call.from || '—'}</td>
                    <td className="mono">{call.to || '—'}</td>
                    <td className="num">{minutes(call.durationSeconds)}</td>
                    <td className={call.costAmount ? 'num' : 'num muted'}>{money(call.costAmount, call.currency)}</td>
                    <td><span className={`pill pill--${callTone(call.status)}`}>{callStatusLabel(call.status)}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        disabled={refreshing === call.id}
                        onClick={() => refresh(call.id)}
                        title="Pull the Telnyx detail record for this call."
                      >
                        {refreshing === call.id ? 'Refreshing' : <><Icon name="refresh" size={13} />Price</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="status-note">
          <Icon name="server" size={14} />
          Calls are recorded automatically after they connect; only the admin can play the audio. A public URL to <span className="mono">/api/telnyx/webhook</span> lets Telnyx push the price and the recording itself.
        </p>
      </section>
    </div>
  )
}

function WhatsApp() {
  const [link, setLink] = useState<WaLink | null>(null)
  const [chats, setChats] = useState<Chat[] | null>(null)
  const [selected, setSelected] = useState('')
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [summary, setSummary] = useState<Pick<Chat, 'summaryText' | 'summaryAt' | 'summaryMessageCount' | 'summaryStale'> | null>(null)
  const [error, setError] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [reply, setReply] = useState<ReplyState | null>(null)
  const selectedRef = useRef('')

  async function loadChats() {
    const rows = await readJson<Chat[]>(await fetch('/api/whatsapp/chats'))
    setChats(rows)
    return rows
  }

  async function openChat(jid: string, known?: Chat) {
    setSelected(jid)
    setError('')
    const chat = known ?? chats?.find((item) => item.jid === jid)
    setSummary(chat ? {
      summaryText: chat.summaryText,
      summaryAt: chat.summaryAt,
      summaryMessageCount: chat.summaryMessageCount,
      summaryStale: chat.summaryStale,
    } : null)
    try {
      setMessages(await readJson<Message[]>(await fetch(`/api/whatsapp/chats/${encodeURIComponent(jid)}/messages`)))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load texts.')
    }
  }

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  useEffect(() => {
    loadChats().catch((reason: Error) => setError(reason.message))
    fetch('/api/whatsapp/status').then((response) => readJson<WaLink>(response)).then(setLink).catch(() => undefined)
    fetch('/api/whatsapp/reply').then((response) => readJson<ReplyState>(response)).then(setReply).catch(() => undefined)
    const source = new EventSource('/api/whatsapp/events')
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as WaLink
      if (!next.type) setLink(next)
      if (next.type !== 'message') return
      const jid = selectedRef.current
      loadChats().then(async (rows) => {
        if (!jid) return
        const chat = rows.find((item) => item.jid === jid)
        if (chat) {
          setSummary({
            summaryText: chat.summaryText,
            summaryAt: chat.summaryAt,
            summaryMessageCount: chat.summaryMessageCount,
            summaryStale: chat.summaryStale,
          })
        }
        setMessages(await readJson<Message[]>(await fetch(`/api/whatsapp/chats/${encodeURIComponent(jid)}/messages`)))
        setReply(await readJson<ReplyState>(await fetch('/api/whatsapp/reply')))
      }).catch(() => undefined)
    }
    source.onerror = () => setLink((current) => current ?? { connection: 'error', qrDataUrl: null, error: 'Live updates paused. Refresh the page.' })
    return () => source.close()
  }, [])

  const current = chats?.find((chat) => chat.jid === selected) ?? null

  async function summarize() {
    if (!selected) return
    setSummarizing(true)
    setError('')
    try {
      const result = await readJson<Chat>(await fetch(`/api/whatsapp/chats/${encodeURIComponent(selected)}/summary`, { method: 'POST' }))
      setSummary(result)
      await loadChats()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Summary failed.')
    } finally {
      setSummarizing(false)
    }
  }

  const connectionTone = !link ? 'plain' : link.connection === 'open' ? 'ok' : link.connection === 'qr' || link.connection === 'starting' ? 'warn' : 'bad'
  const replyEnabled = reply?.enabled ?? true

  return (
    <div className="page">
      <PageHead
        eyebrow="Admin"
        title="WhatsApp"
        lead="One Baileys account, linked from this machine. Inbound texts are stored per chat, counted, and summarized on demand."
        actions={<span className={`pill pill--${connectionTone}`}>{link ? linkLabel(link.connection) : 'Checking'}</span>}
      />
      {error ? <Alert>{error}</Alert> : null}

      <div className="wa-top">
        <section className="panel">
          <div className="panel__head">
            <h2><WhatsAppMark size={16} /> Linked account</h2>
            <span className="tag">Baileys</span>
          </div>
          {link?.error ? <Alert>{link.error}</Alert> : null}
          <div className="wa-link">
            <div>
              {link?.qrDataUrl ? (
                <>
                  <p>Open WhatsApp on your phone, then Linked devices, then scan the code. The desk shows the connection as linked once the scan lands.</p>
                  <ol className="steps" style={{ marginTop: 14 }}>
                    <li>Open WhatsApp on the phone that owns the account.</li>
                    <li>Go to Settings, then Linked devices, then Link a device.</li>
                    <li>Point the phone at the code. It refreshes on its own.</li>
                  </ol>
                </>
              ) : (
                <>
                  <p>
                    {link?.connection === 'open'
                      ? 'The linked account is connected. Inbound texts are stored and counted per chat, and the auto-reply below can answer in your pattern.'
                      : 'Waiting for the connection. A QR code appears here when Baileys asks for a scan.'}
                  </p>
                  <p className="status-note">
                    <Icon name="server" size={14} />
                    Auth state lives in <span className="mono">data/baileys-auth</span> on the API machine.
                  </p>
                </>
              )}
            </div>
            {link?.qrDataUrl ? (
              <div className="qr">
                <img src={link.qrDataUrl} alt="WhatsApp link code" width="196" height="196" />
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2>Auto-reply</h2>
            <label className="switch">
              <input
                type="checkbox"
                checked={replyEnabled}
                onChange={(event) => {
                  const enabled = event.target.checked
                  setReply((value) => value ? { ...value, enabled } : value)
                  fetch('/api/whatsapp/reply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled }),
                  }).then((response) => readJson<ReplyState>(response)).then(setReply).catch((reason: Error) => setError(reason.message))
                }}
              />
              <span className="switch__track" aria-hidden="true" />
              <span>{replyEnabled ? 'On' : 'Off'}</span>
            </label>
          </div>
          {reply == null ? <Loading label="Loading the reply pattern." /> : reply.exampleCount < 3 ? (
            <>
              <p className="reply-pattern">Replying in short lines until your own texts teach the pattern.</p>
              <p className="reply-pattern__meta">{reply.exampleCount} of 3 replies seen · answer from your phone and the next replies follow you</p>
            </>
          ) : (
            <>
              <p className="reply-pattern">{reply.pattern || 'Reading your replies.'}</p>
              <p className="reply-pattern__meta">{reply.updatedAt ? `learned ${when(reply.updatedAt)}` : 'pattern ready'}</p>
            </>
          )}
        </section>
      </div>

      <div className="wa">
        <section className="panel">
          <div className="panel__head">
            <h2>Chats <span className="panel__count">{chats?.length ?? 0}</span></h2>
            <span className="tag">inbound texts</span>
          </div>
          {chats == null ? (error ? (
            <Empty icon="whatsapp" title="Chats did not load" body="The API did not answer. The linked account is not reachable." />
          ) : <Loading label="Loading chats." />) : chats.length === 0 ? (
            <Empty
              icon="whatsapp"
              title="No texts yet"
              body="Messages that arrive after the link show here, grouped by chat with a count and a preview."
            />
          ) : (
            <ul className="chat-list">
              {chats.map((chat) => (
                <li key={chat.jid}>
                  <button
                    type="button"
                    className="chat"
                    aria-current={chat.jid === selected ? 'true' : undefined}
                    onClick={() => openChat(chat.jid, chat)}
                  >
                    <span className="chat__avatar" aria-hidden="true">{initials(chatLabel(chat))}</span>
                    <span className="chat__body">
                      <span className="chat__name">{chatLabel(chat)}</span>
                      <span className="chat__preview">{chat.lastText}</span>
                    </span>
                    <span className="chat__meta">
                      <span>{clock(chat.lastMessageAt)}</span>
                      <span>{chat.messageCount} {chat.messageCount === 1 ? 'text' : 'texts'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          {!current ? (
            <>
              <div className="panel__head">
                <h2>Transcript</h2>
                <span className="tag">on demand</span>
              </div>
              <Empty
                icon="whatsapp"
                title="Select a chat"
                body="Read the stored texts, the count, the first and last message, and an on-demand summary."
              />
            </>
          ) : (
            <>
              <div className="thread-head">
                <div>
                  <h2>{chatLabel(current)}</h2>
                  <div className="thread-head__meta">
                    <span><span className="mono">{current.messageCount}</span> {current.messageCount === 1 ? 'text' : 'texts'}</span>
                    <span>First <span className="mono">{when(current.firstMessageAt)}</span></span>
                    <span>Last <span className="mono">{when(current.lastMessageAt)}</span></span>
                  </div>
                </div>
                <span className={`pill pill--${current.messageCount > 0 ? 'ok' : 'plain'}`}>{current.messageCount > 0 ? 'stored' : 'empty'}</span>
              </div>

              <div className="summary">
                <div className="summary__head">
                  <h3><Icon name="spark" size={14} /> Summary</h3>
                  <button type="button" className="btn btn--primary btn--sm" disabled={summarizing} onClick={summarize}>
                    {summarizing ? 'Writing summary' : summary?.summaryText ? 'Regenerate' : 'Generate summary'}
                  </button>
                </div>
                {summary?.summaryText ? (
                  <p className="summary__text">{summary.summaryText}</p>
                ) : (
                  <p className="summary__text summary__text--empty">No summary yet. The stats above stay either way.</p>
                )}
                {summary?.summaryStale ? (
                  <p className="summary__stale">Covers {summary.summaryMessageCount} of {current.transcriptCount} texts</p>
                ) : null}
              </div>

              {messages == null ? (error ? (
                <Empty icon="whatsapp" title="Texts did not load" body="The API did not answer. Reload once the server is back." />
              ) : <Loading label="Loading texts." />) : messages.length === 0 ? (
                <Empty icon="whatsapp" title="No texts stored" body="This chat has a count but no stored text rows yet." />
              ) : (
                <ol className="thread">
                  {messages.map((message) => (
                    <li key={message.id} className={message.fromMe ? 'msg msg--mine' : 'msg'}>
                      <span className="msg__meta">
                        <strong>{message.fromMe ? 'You' : message.pushName || 'Unknown'}</strong>
                        <time dateTime={message.timestamp}>{clock(message.timestamp)}</time>
                      </span>
                      <span className="msg__body">{message.body}</span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function linkLabel(connection: string) {
  if (connection === 'open') return 'Linked'
  if (connection === 'qr') return 'Waiting for the scan'
  if (connection === 'starting') return 'Starting'
  if (connection === 'close') return 'Disconnected'
  if (connection === 'error') return 'Not running'
  return connection
}


