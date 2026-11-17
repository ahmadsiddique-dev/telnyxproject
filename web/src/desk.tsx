import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Icon, BrandMark, WhatsAppMark } from './icons'

export type SessionUser = {
  id: number
  email: string
  name: string
  role: 'admin' | 'user'
  balanceUnits: number
}

type TelnyxPool = {
  currency: string
  balance: string
  available: string
  creditLimit: string
  pending: string
  allocated: string
  remaining: string
  remainingUnits: number
}

type DashboardData = {
  balance: string
  spent: string
  durationSeconds: number
  pendingCostCount: number
  byDestination: { destination: string, calls: number, durationSeconds: number, amount: string }[]
  ledger: { id: number, kind: string, amount: string, note: string | null, createdAt: string }[]
}

type GalleryNumber = {
  phoneNumber: string
  type: string
  region: string
  upfrontCost: string
  monthlyCost: string
  currency: string
  features: string[]
}

type OwnedNumber = {
  phone_number: string
  region: string | null
  upfront_cost: string | null
  monthly_cost: string | null
  currency: string | null
  ordered_at: string
}

type CreditRequest = {
  id: number
  email: string | null
  name: string | null
  amount: string
  note: string | null
  status: string
  createdAt: string
}

const countries = [
  ['US', 'United States'],
  ['CA', 'Canada'],
  ['GB', 'United Kingdom'],
  ['AU', 'Australia'],
  ['PK', 'Pakistan'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['AE', 'United Arab Emirates'],
] as const

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

function dollars(value: string, digits = 2) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function minutes(seconds: number) {
  return `${(seconds / 60).toFixed(1)} min`
}

function when(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

function toneFor(status: string) {
  const value = status.toLowerCase()
  if (value === 'approved' || value === 'answered' || value === 'active' || value === 'open') return 'ok'
  if (value === 'pending' || value === 'ringing' || value === 'initiated' || value === 'requesting') return 'warn'
  if (value === 'rejected' || value === 'failed' || value === 'busy') return 'bad'
  return 'plain'
}

function chargeUnits(item: GalleryNumber) {
  const upfront = Number(item.upfrontCost)
  const monthly = Number(item.monthlyCost)
  const charge = Number.isFinite(upfront) && upfront > 0 ? upfront : monthly
  if (!Number.isFinite(charge) || charge < 0) return null
  return Math.round(charge * 10000)
}

export function PageHead({ eyebrow, title, lead, actions, stat }: {
  eyebrow: string
  title: string
  lead?: string
  actions?: ReactNode
  stat?: ReactNode
}) {
  return (
    <header className="page-head">
      <div className="page-head__text">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {lead ? <p className="page-head__lead">{lead}</p> : null}
      </div>
      {actions ? <div className="page-head__actions">{actions}</div> : stat}
    </header>
  )
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="alert" role="alert">
      <Icon name="admin" size={15} />
      <span>{children}</span>
    </div>
  )
}

export function Loading({ label }: { label: string }) {
  return <p className="loading" role="status">{label}</p>
}

export function Empty({ icon, title, body, action }: {
  icon: 'calls' | 'numbers' | 'billing' | 'admin' | 'whatsapp' | 'dashboard'
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden="true">
        {icon === 'whatsapp' ? <WhatsAppMark size={17} /> : <Icon name={icon} size={17} />}
      </span>
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </div>
  )
}

export function AuthScreen({ onSuccess }: { onSuccess: (user: SessionUser) => void }) {
  const [mode, setMode] = useState(window.location.hash === '#/signup' ? 'signup' : 'login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const user = await readJson<SessionUser>(await fetch(mode === 'signup' ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      }))
      window.location.hash = '#/'
      onSuccess(user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <section className="auth__brand" aria-label="About this desk">
        <div className="auth__grid" aria-hidden="true" />
        <a className="brand" href="#/" aria-label="Desk home">
          <BrandMark size={32} />
          <span>
            <span className="brand__name">Desk</span>
            <span className="brand__sub">Telnyx × Baileys</span>
          </span>
        </a>
        <div className="auth__brand-mid">
          <p className="eyebrow">Operations console</p>
          <p className="auth__statement">
            The desk for Telnyx calls and <em>one WhatsApp line.</em>
          </p>
          <p className="auth__lead">
            Buy numbers, dial from the browser, and read what arrived on WhatsApp.
            Credit moves when your admin approves it.
          </p>
          <ul className="auth__facts">
            <li><Icon name="calls" size={16} /> Telnyx SIP voice <span>WebRTC</span></li>
            <li><WhatsAppMark size={16} /> One linked WhatsApp account <span>Baileys</span></li>
            <li><Icon name="billing" size={16} /> Credit approved by an admin <span>USD</span></li>
          </ul>
        </div>
        <div className="auth__brand-foot">
          <span>Telnyx voice · Baileys WhatsApp</span>
          <span>Desk 1.0</span>
        </div>
        <svg className="auth__trace" viewBox="0 0 520 260" fill="none" aria-hidden="true">
          <path d="M-20 210h96l42-64h92l38-58h86l44 74h102" stroke="#3b4a26" strokeWidth="1" />
          <path d="M-20 210h96l42-64h92" stroke="#dafa9c" strokeWidth="1" opacity=".45" />
          <circle cx="118" cy="146" r="3" fill="#dafa9c" />
          <circle cx="252" cy="88" r="2.5" fill="#6d7f4b" />
          <circle cx="338" cy="88" r="3" fill="#dafa9c" opacity=".55" />
          <circle cx="494" cy="162" r="2.5" fill="#6d7f4b" />
          <circle cx="76" cy="210" r="2" fill="#555b45" />
        </svg>
      </section>

      <section className="auth__panel">
        <div className="auth__form">
          <p className="eyebrow">{mode === 'signup' ? 'New account' : 'Welcome back'}</p>
          <h1>{mode === 'signup' ? 'Create your account' : 'Sign in to the desk'}</h1>
          <p className="auth__hint">
            {mode === 'signup'
              ? 'The first account on a fresh install becomes the admin. Everyone after that is a user.'
              : 'Use the account your admin set up. Everything on the desk stays on this machine.'}
          </p>
          <form onSubmit={submit}>
            {mode === 'signup' ? (
              <label className="field">Name
                <input className="input" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
              </label>
            ) : null}
            <label className="field">Email
              <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </label>
            <label className="field">Password
              <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required />
            </label>
            {error ? <Alert>{error}</Alert> : null}
            <button className="btn btn--primary btn--wide" type="submit" disabled={busy}>
              {busy ? 'Working' : mode === 'signup' ? 'Create account' : 'Sign in'}
              {busy ? null : <Icon name="arrow" size={16} />}
            </button>
          </form>
          <p className="auth__switch">
            {mode === 'signup' ? 'Already have an account?' : 'Need an account?'}{' '}
            <button type="button" className="linkish" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError('') }}>
              {mode === 'signup' ? 'Sign in' : 'Create one'}
            </button>
          </p>
          <p className="auth__note">
            <Icon name="server" size={14} />
            Calls use the Telnyx credential connection. The SIP password never reaches the browser.
          </p>
        </div>
      </section>
    </main>
  )
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/dashboard').then((response) => readJson<DashboardData>(response)).then(setData).catch((reason: Error) => setError(reason.message))
  }, [])

  const maxSpend = data ? Math.max(...data.byDestination.map((row) => Number(row.amount) || 0), 0.0001) : 1

  return (
    <div className="page">
      <PageHead
        eyebrow="Workspace"
        title="Dashboard"
        lead="Your balance, the minutes Telnyx billed, and where the money went. Prices land as Telnyx reports them."
        actions={(
          <>
            <a className="btn btn--primary" href="#/calls"><Icon name="calls" size={16} />Place a call</a>
            <a className="btn btn--secondary" href="#/billing">Request credit</a>
          </>
        )}
      />
      {error ? <Alert>{error}</Alert> : null}
      {!data ? (error ? (
        <Empty icon="dashboard" title="The account did not load" body="The API did not answer. Reload once the server is back." action={<button className="btn btn--secondary btn--sm" type="button" onClick={() => window.location.reload()}>Reload</button>} />
      ) : <Loading label="Loading your account." />) : (
        <>
          <div className="metrics">
            <article className="metric">
              <p className="metric__label">Balance<span className="tag">USD</span></p>
              <p className="metric__value">{dollars(data.balance)}</p>
              <p className="metric__foot">Approved credit minus calls and numbers</p>
            </article>
            <article className="metric">
              <p className="metric__label">Spent</p>
              <p className="metric__value">{dollars(data.spent, 2)}</p>
              <p className="metric__foot">What Telnyx reported for your calls</p>
            </article>
            <article className="metric">
              <p className="metric__label">Telnyx minutes</p>
              <p className="metric__value">{(data.durationSeconds / 60).toFixed(1)}<span>min</span></p>
              <p className={data.pendingCostCount > 0 ? 'metric__foot metric__foot--warn' : 'metric__foot'}>
                {data.pendingCostCount > 0
                  ? `${data.pendingCostCount} ${data.pendingCostCount === 1 ? 'call is' : 'calls are'} waiting on a price`
                  : 'Every ended call has a price'}
              </p>
            </article>
          </div>

          <div className="stack">
            <div className="grid-2--wide grid-2">
              <section className="panel">
                <div className="panel__head">
                  <h2>Where it went</h2>
                  <span className="tag">by destination</span>
                </div>
                {data.byDestination.length === 0 ? (
                  <Empty
                    icon="calls"
                    title="No priced calls yet"
                    body="Minutes and cost appear here after Telnyx prices a finished call."
                    action={<a className="btn btn--secondary btn--sm" href="#/calls">Open calls</a>}
                  />
                ) : (
                  <ul className="usage">
                    {data.byDestination.map((row) => (
                      <li key={row.destination}>
                        <div className="usage__dest">
                          <span className="mono">{row.destination}</span>
                          <span>{row.calls} {row.calls === 1 ? 'call' : 'calls'} · {minutes(row.durationSeconds)}</span>
                        </div>
                        <div className="usage__track" aria-hidden="true">
                          <span style={{ width: `${Math.max(4, (Number(row.amount) / maxSpend) * 100)}%` }} />
                        </div>
                        <span className="usage__amount mono">{dollars(row.amount, 4)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel">
                <div className="panel__head">
                  <h2>Cost watch</h2>
                  <span className="tag">Telnyx pricing</span>
                </div>
                <div className="metric__value">{data.pendingCostCount}<span>{data.pendingCostCount === 1 ? 'call' : 'calls'}</span></div>
                <p className="metric__foot" style={{ whiteSpace: 'normal' }}>
                  {data.pendingCostCount > 0
                    ? 'Ended calls without a price from Telnyx. Refresh the call to pull its detail record.'
                    : 'Nothing is waiting. Cost is stored when Telnyx reports it after hangup.'}
                </p>
                <ol className="steps" style={{ marginTop: 18 }}>
                  <li>Duration runs from answered to hangup, in seconds.</li>
                  <li>Telnyx prices the call after it ends. Until then it reads pending.</li>
                  <li>Refresh pulls the detail record if the cost webhook never arrives.</li>
                </ol>
              </section>
            </div>

            <section className="panel">
              <div className="panel__head">
                <h2>Ledger</h2>
                <span className="tag">{data.ledger.length} {data.ledger.length === 1 ? 'entry' : 'entries'}</span>
              </div>
              {data.ledger.length === 0 ? (
                <Empty
                  icon="billing"
                  title="Nothing on the ledger yet"
                  body="Approved credit, number purchases, and call charges are listed here in order."
                  action={<a className="btn btn--secondary btn--sm" href="#/billing">Request credit</a>}
                />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th scope="col">When</th><th scope="col">Kind</th><th scope="col">Note</th><th scope="col">Amount</th></tr>
                    </thead>
                    <tbody>
                      {data.ledger.map((row) => (
                        <tr key={row.id}>
                          <td className="mono">{when(row.createdAt)}</td>
                          <td><span className="tag">{row.kind}</span></td>
                          <td>{row.note || '—'}</td>
                          <td className="num">{dollars(row.amount, 4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

export function NumbersPage() {
  const [country, setCountry] = useState('US')
  const [area, setArea] = useState('')
  const [contains, setContains] = useState('')
  const [results, setResults] = useState<GalleryNumber[] | null>(null)
  const [owned, setOwned] = useState<OwnedNumber[]>([])
  const [balanceUnits, setBalanceUnits] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function loadOwned() {
    setOwned(await readJson<OwnedNumber[]>(await fetch('/api/numbers')))
  }

  useEffect(() => {
    loadOwned().catch((reason: Error) => setError(reason.message))
    fetch('/api/auth/me').then((response) => readJson<SessionUser>(response)).then((user) => setBalanceUnits(user.balanceUnits)).catch(() => setBalanceUnits(0))
  }, [])

  async function search(event: FormEvent) {
    event.preventDefault()
    setError('')
    setResults(null)
    const params = new URLSearchParams({ country, area, contains })
    try {
      setResults(await readJson<GalleryNumber[]>(await fetch(`/api/numbers/available?${params}`)))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The gallery did not load.')
    }
  }

  async function buy(phoneNumber: string) {
    setBusy(phoneNumber)
    setError('')
    try {
      await readJson(await fetch('/api/numbers/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, country }),
      }))
      await loadOwned()
      setResults((current) => current?.filter((item) => item.phoneNumber !== phoneNumber) ?? null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The number was not purchased.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page">
      <PageHead
        eyebrow="Inventory"
        title="Number gallery"
        lead="Search what Telnyx has available, then buy a number onto your account. The charge comes out of your balance."
        stat={(
          <div className="page-head__stat">
            <span>Your balance</span>
            <strong>{balanceUnits == null ? '—' : dollars((balanceUnits / 10000).toFixed(2))}</strong>
          </div>
        )}
      />
      {balanceUnits === 0 ? (
        <div className="alert" role="alert">
          <Icon name="billing" size={15} />
          <span>Your balance is $0.00. <a className="linkish" href="#/billing">Request credit</a> and wait for approval before buying a number.</span>
        </div>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}

      <div className="stack">
        <section className="panel">
          <div className="panel__head">
            <h2>Filter inventory</h2>
            <span className="tag">Telnyx API</span>
          </div>
          <form className="searchbar" onSubmit={search}>
            <label className="field">Country
              <select className="select" value={country} onChange={(event) => setCountry(event.target.value)}>
                {countries.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </label>
            <label className="field">Area code
              <input className="input mono" value={area} onChange={(event) => setArea(event.target.value)} inputMode="numeric" placeholder="415" />
            </label>
            <label className="field">Contains
              <input className="input mono" value={contains} onChange={(event) => setContains(event.target.value)} placeholder="202" />
            </label>
            <button className="btn btn--primary" type="submit"><Icon name="search" size={15} />Search</button>
          </form>
        </section>

        {owned.length > 0 ? (
          <section className="panel">
            <div className="panel__head">
              <h2>Your numbers <span className="panel__count">{owned.length}</span></h2>
              <span className="tag">assigned to you</span>
            </div>
            <ul className="owned">
              {owned.map((item) => (
                <li key={item.phone_number}>
                  <span className="owned__phone">{item.phone_number}</span>
                  <span className="owned__meta">
                    <span>{item.region || 'Purchased'} · {when(item.ordered_at)}</span>
                    <span className="mono">
                      {item.monthly_cost ? `${dollars(item.monthly_cost)} / mo` : item.upfront_cost ? `${dollars(item.upfront_cost)} once` : 'included'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {results == null && !error ? (
          <Empty
            icon="numbers"
            title="Search to load Telnyx inventory"
            body="Pick a country, add an area code if you have one, and search. Every number here can be bought with your balance."
          />
        ) : results == null ? null : results.length === 0 ? (
          <Empty
            icon="numbers"
            title="No numbers matched those filters"
            body="Try a wider area, another country, or leave the contains field empty."
          />
        ) : (
          <>
            <div className="section-head">
              <h2>Available now <span className="panel__count">{results.length}</span></h2>
              <span>Prices in USD, from Telnyx</span>
            </div>
            <div className="number-grid">
              {results.map((item) => {
                const cost = chargeUnits(item)
                const short = balanceUnits != null && (balanceUnits <= 0 || (cost != null && balanceUnits < cost))
                return (
                  <article className="number-card" key={item.phoneNumber}>
                    <div>
                      <div className="number-card__top">
                        <span className="number-card__phone mono">{item.phoneNumber}</span>
                        <span className="tag">{item.region || item.type || country}</span>
                      </div>
                      <p className="number-card__region">{item.type || 'Number'} · {country}</p>
                    </div>
                    <dl className="number-card__price">
                      <div><dt>Up front</dt><dd>{dollars(item.upfrontCost)}</dd></div>
                      <div><dt>Monthly</dt><dd>{dollars(item.monthlyCost)}</dd></div>
                    </dl>
                    {item.features?.length ? (
                      <ul className="chips">
                        {item.features.slice(0, 4).map((feature) => <li key={feature}>{feature.replace(/_/g, ' ')}</li>)}
                      </ul>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn--secondary btn--wide"
                      disabled={short || busy === item.phoneNumber}
                      title={short ? 'Add credit before buying this number.' : undefined}
                      onClick={() => buy(item.phoneNumber)}
                    >
                      {busy === item.phoneNumber ? 'Buying' : short ? 'Need credit' : 'Buy number'}
                    </button>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function BillingPage() {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<CreditRequest[] | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setRows(await readJson<CreditRequest[]>(await fetch('/api/billing/requests')))
  }

  useEffect(() => {
    load().catch((reason: Error) => setError(reason.message))
    fetch('/api/dashboard')
      .then((response) => readJson<DashboardData>(response))
      .then((data) => setBalance(data.balance))
      .catch(() => undefined)
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await readJson(await fetch('/api/billing/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, note }),
      }))
      setAmount('')
      setNote('')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The request was not sent.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <PageHead
        eyebrow="Billing"
        title="Credit"
        lead="Ask for credit and an admin approves it. The amount lands on your balance, then calls and number purchases spend it."
        stat={(
          <div className="page-head__stat">
            <span>Current balance</span>
            <strong>{balance == null ? '—' : dollars(balance)}</strong>
          </div>
        )}
      />
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid-2--wide grid-2" style={{ marginBottom: 16 }}>
        <section className="panel">
          <div className="panel__head">
            <h2>Request credit</h2>
            <span className="tag">approval needed</span>
          </div>
          <form className="stack" onSubmit={submit}>
            <label className="field">Amount in USD
              <input className="input mono" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="25.00" required />
            </label>
            <label className="field">
              <span className="field__label">Note <span className="muted">(optional)</span></span>
              <input className="input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What this credit is for" />
            </label>
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {busy ? 'Sending' : 'Request credit'}
            </button>
            <p className="status-note">Your admin sees the request on the approvals screen. Nothing is charged to a card.</p>
          </form>
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2>How credit works</h2>
            <span className="tag">in-app balance</span>
          </div>
          <ol className="steps">
            <li>You ask for an amount. It waits as pending until an admin decides.</li>
            <li>Approval adds the amount to your balance. Rejection leaves it at zero.</li>
            <li>Calls draw cost as Telnyx reports it. Numbers charge their upfront or monthly cost.</li>
            <li>Your balance is separate from the Telnyx account balance your admin sees.</li>
          </ol>
          <div className="alert alert--info" style={{ marginTop: 18, marginBottom: 0 }}>
            <Icon name="billing" size={15} />
            <span>The desk does not charge a card. Every credit line comes from an admin.</span>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2>Requests <span className="panel__count">{rows?.length ?? 0}</span></h2>
          <span className="tag">newest first</span>
        </div>
        {rows == null ? (error ? (
          <Empty icon="billing" title="Requests did not load" body="The API did not answer. Reload once the server is back." />
        ) : <Loading label="Loading requests." />) : rows.length === 0 ? (
          <Empty
            icon="billing"
            title="No requests yet"
            body="The first request you send shows here with its amount, note, and status."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">When</th><th scope="col">Amount</th><th scope="col">Note</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{when(row.createdAt)}</td>
                    <td className="num">{dollars(row.amount)}</td>
                    <td>{row.note || '—'}</td>
                    <td><span className={`pill pill--${toneFor(row.status)}`}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export function AdminPage() {
  const [rows, setRows] = useState<CreditRequest[] | null>(null)
  const [pool, setPool] = useState<TelnyxPool | null>(null)
  const [poolError, setPoolError] = useState('')
  const [error, setError] = useState('')
  const [deciding, setDeciding] = useState<number | null>(null)

  async function load() {
    setRows(await readJson<CreditRequest[]>(await fetch('/api/billing/requests')))
  }

  async function loadPool() {
    try {
      setPool(await readJson<TelnyxPool>(await fetch('/api/billing/overview')))
      setPoolError('')
    } catch (reason) {
      setPool(null)
      setPoolError(reason instanceof Error ? reason.message : 'Could not read the Telnyx balance.')
    }
  }

  useEffect(() => {
    load().catch((reason: Error) => setError(reason.message))
    loadPool()
  }, [])

  async function decide(id: number, approve: boolean) {
    setError('')
    setDeciding(id)
    try {
      await readJson(await fetch(`/api/billing/requests/${id}/${approve ? 'approve' : 'reject'}`, { method: 'POST' }))
      await Promise.all([load(), loadPool()])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The decision was not saved.')
    } finally {
      setDeciding(null)
    }
  }

  const pending = rows?.filter((row) => row.status === 'pending') ?? []
  const decided = rows?.filter((row) => row.status !== 'pending').slice(0, 6) ?? []

  return (
    <div className="page">
      <PageHead
        eyebrow="Admin"
        title="Approvals"
        lead="Approve credit from the unallocated Telnyx balance. Approval credits the user’s in-app balance and leaves the carrier balance untouched."
      />
      {error ? <Alert>{error}</Alert> : null}

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel__head">
          <h2>Telnyx account</h2>
          <span className="tag">carrier balance</span>
        </div>
        {poolError ? <Alert>{poolError}</Alert> : pool ? (
          <dl className="facts">
            <div><dt>Telnyx balance</dt><dd>{dollars(pool.balance)}</dd></div>
            <div><dt>Available credit</dt><dd>{dollars(pool.available)}</dd></div>
            <div><dt>In user balances</dt><dd>{dollars(pool.allocated)}</dd></div>
            <div><dt>Left to approve</dt><dd>{dollars(pool.remaining)}</dd></div>
            <div><dt>Credit limit</dt><dd>{dollars(pool.creditLimit)}</dd></div>
          </dl>
        ) : <Loading label="Loading the Telnyx balance." />}
      </section>

      <div className="stack">
        <section className="panel">
          <div className="panel__head">
            <h2>Waiting for a decision <span className="panel__count">{pending.length}</span></h2>
            <span className="tag">oldest first</span>
          </div>
          {rows == null ? (error ? (
            <Empty icon="admin" title="Requests did not load" body="The API did not answer. Reload once the server is back." />
          ) : <Loading label="Loading requests." />) : pending.length === 0 ? (
            <Empty
              icon="admin"
              title="No credit requests waiting"
              body="New requests from users land here. Approved and rejected rows move to the list below."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th scope="col">Who</th><th scope="col">Amount</th><th scope="col">Note</th><th scope="col">Decision</th></tr></thead>
                <tbody>
                  {pending.map((row) => {
                    const amountUnits = Math.round(Number(row.amount) * 10000)
                    const tooBig = pool != null && amountUnits > pool.remainingUnits
                    const working = deciding === row.id
                    return (
                      <tr key={row.id}>
                        <td>
                          <span className="who">
                            <strong>{row.name || 'Unnamed user'}</strong>
                            <span>{row.email || '—'}</span>
                          </span>
                        </td>
                        <td className="num">{dollars(row.amount)}</td>
                        <td>{row.note || '—'}</td>
                        <td>
                          <span className="actions">
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              onClick={() => decide(row.id, true)}
                              disabled={tooBig || working}
                              title={tooBig ? 'Not enough unallocated Telnyx balance.' : undefined}
                            >
                              {working ? 'Saving' : 'Approve'}
                            </button>
                            <button type="button" className="btn btn--secondary btn--sm" onClick={() => decide(row.id, false)} disabled={working}>Reject</button>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {decided.length > 0 ? (
          <section className="panel">
            <div className="panel__head">
              <h2>Recent decisions</h2>
              <span className="tag">latest {decided.length}</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th scope="col">Who</th><th scope="col">Amount</th><th scope="col">Decided</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  {decided.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span className="who">
                          <strong>{row.name || 'Unnamed user'}</strong>
                          <span>{row.email || '—'}</span>
                        </span>
                      </td>
                      <td className="num">{dollars(row.amount)}</td>
                      <td className="mono">{when(row.createdAt)}</td>
                      <td><span className={`pill pill--${toneFor(row.status)}`}>{row.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}


type AdminRecording = {
  id: number | null
  callId: number
  userName: string | null
  userEmail: string | null
  direction: string | null
  from: string | null
  to: string | null
  callStatus: string
  startedAt: string | null
  durationSeconds: number | null
  status: string
  error: string | null
  format: string | null
  channels: string | null
  durationMillis: number | null
  sizeBytes: number | null
  hasAudio: boolean
  createdAt: string
  recordingStartedAt: string | null
}

type RecordingSync = {
  checked: number
  found: number
  downloaded: number
  errors: string[]
}

function recordingLength(row: AdminRecording) {
  if (row.durationMillis != null) return `${(row.durationMillis / 60000).toFixed(1)} min`
  if (row.durationSeconds != null) return minutes(row.durationSeconds)
  return '—'
}

function fileSize(bytes: number | null) {
  if (bytes == null) return '—'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function recordingLabel(status: string) {
  if (status === 'ready') return 'Ready'
  if (status === 'recording') return 'Recording'
  if (status === 'requesting') return 'Starting'
  if (status === 'failed') return 'Failed'
  return 'Not recorded'
}

function recordingTone(status: string) {
  if (status === 'ready') return 'ok'
  if (status === 'recording' || status === 'requesting') return 'warn'
  if (status === 'failed') return 'bad'
  return 'plain'
}

export function RecordingsPage() {
  const [rows, setRows] = useState<AdminRecording[] | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [syncing, setSyncing] = useState(false)

  async function load() {
    setRows(await readJson<AdminRecording[]>(await fetch('/api/admin/recordings')))
  }

  useEffect(() => {
    load().catch((reason: Error) => setError(reason.message))
  }, [])

  async function sync() {
    setSyncing(true)
    setError('')
    setNote('')
    try {
      const result = await readJson<RecordingSync>(await fetch('/api/admin/recordings/sync', { method: 'POST' }))
      await load()
      setNote(`Checked ${result.checked} ${result.checked === 1 ? 'call' : 'calls'}, found ${result.found}, stored ${result.downloaded}.${result.errors.length ? ` ${result.errors[0]}` : ''}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The recording sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="page">
      <PageHead
        eyebrow="Admin"
        title="Call recordings"
        lead="Every call placed through Telnyx is recorded on the server. Audio is stored with the app, and only an admin account can play it."
        actions={<span className="pill pill--plain">{rows ? `${rows.length} calls` : 'recordings'}</span>}
      />
      {error ? <Alert>{error}</Alert> : null}
      {note ? <p className="status-note"><Icon name="server" size={14} />{note}</p> : null}

      <section className="panel">
        <div className="panel__head">
          <h2>Recorded calls <span className="panel__count">{rows?.length ?? 0}</span></h2>
          <span className="actions">
            <span className="tag">admin only</span>
            <button type="button" className="btn btn--secondary btn--sm" disabled={syncing} onClick={sync}>
              <Icon name="refresh" size={13} />
              {syncing ? 'Checking Telnyx' : 'Sync from Telnyx'}
            </button>
          </span>
        </div>
        {rows == null ? <Loading label="Loading recordings." /> : rows.length === 0 ? (
          <Empty
            icon="calls"
            title="No calls yet"
            body="Recordings appear here after a call is answered and Telnyx saves the audio."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Direction</th>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col">Length</th>
                  <th scope="col">Recording</th>
                  <th scope="col">Size</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.callId}>
                    <td className="mono">{when(row.startedAt)}</td>
                    <td>
                      <span className="who">
                        <strong>{row.userName || 'Unknown user'}</strong>
                        <span>{row.userEmail || '—'}</span>
                      </span>
                    </td>
                    <td>{row.direction ? row.direction.charAt(0).toUpperCase() + row.direction.slice(1) : '—'}</td>
                    <td className="mono">{row.from || '—'}</td>
                    <td className="mono">{row.to || '—'}</td>
                    <td className="num">{recordingLength(row)}</td>
                    <td>
                      {row.id != null && row.status === 'ready' ? (
                        <audio
                          className="recording-player"
                          controls
                          preload="none"
                          src={`/api/admin/recordings/${row.id}/audio`}
                          aria-label={`Recording of call from ${row.from || 'unknown'} to ${row.to || 'unknown'}`}
                        />
                      ) : (
                        <span className={`pill pill--${recordingTone(row.status)}`} title={row.error || undefined}>
                          {recordingLabel(row.status)}
                        </span>
                      )}
                    </td>
                    <td className="num">{fileSize(row.sizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="status-note">
          <Icon name="server" size={14} />
          Calls are recorded automatically after they connect. Audio files live under <span className="mono">data/recordings</span>, and only this admin page can stream them.
        </p>
      </section>
    </div>
  )
}
