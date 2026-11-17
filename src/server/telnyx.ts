import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  claimRecordingStart,
  getCall,
  recordingCandidates,
  markRecordingFailed,
  markRecordingStarted,
  recordingForCall,
  recordingRow,
  saveCallRecording,
  setCallCost,
  setRecordingFile,
  upsertCall,
  type CallPatch,
  type RecordingInput,
} from './db.ts'
import { required } from './env.ts'
import { combineCosts, costFromPayload, priceUnits, recordMatches, verifyTelnyx } from './logic.ts'

const credentialFile = 'data/telnyx-credential-id'
const recordingDir = 'data/recordings'

export type TelnyxBalance = {
  balanceUnits: number
  availableUnits: number
  creditLimitUnits: number
  pendingUnits: number
  currency: string
}

export async function fetchBalance(): Promise<TelnyxBalance> {
  const body = await telnyx('/balance') as {
    data?: {
      balance?: string | number
      available_credit?: string | number
      credit_limit?: string | number
      pending?: string | number
      currency?: string
    }
  }
  const data = body.data
  if (!data) throw httpError('Telnyx did not return a balance.', 502)
  const units = (value: unknown, fallback?: string | number) => {
    const parsed = priceUnits(String(value ?? fallback ?? '0'))
    if (parsed == null) throw httpError('Telnyx returned an unreadable balance.', 502)
    return parsed
  }
  return {
    balanceUnits: units(data.balance),
    availableUnits: units(data.available_credit, data.balance),
    creditLimitUnits: units(data.credit_limit),
    pendingUnits: units(data.pending),
    currency: typeof data.currency === 'string' && data.currency ? data.currency : 'USD',
  }
}

export function checkWebhook(rawBody: string, timestamp: string | undefined, signature: string | undefined): boolean {
  const publicKey = process.env.TELNYX_PUBLIC_KEY?.trim()
  if (!publicKey) {
    const error = new Error('Add TELNYX_PUBLIC_KEY to .env and restart.') as Error & { statusCode?: number }
    error.statusCode = 400
    throw error
  }
  if (!timestamp || !signature) return false
  return verifyTelnyx(rawBody, timestamp, signature, publicKey)
}

export function applyWebhook(eventType: string, payload: Record<string, unknown>) {
  const patch: CallPatch = {
    callSessionId: text(payload.call_session_id),
    callLegId: text(payload.call_leg_id),
    callControlId: text(payload.call_control_id),
    direction: payload.direction === 'incoming' ? 'inbound' : payload.direction === 'outgoing' ? 'outbound' : text(payload.direction),
    from: text(payload.from),
    to: text(payload.to),
  }
  if (!patch.callSessionId && !patch.callLegId && !patch.callControlId) return null
  if (eventType === 'call.initiated') {
    return upsertCall({ ...patch, status: 'initiated', startedAt: text(payload.start_time) })
  }
  if (eventType === 'call.ringing') {
    return upsertCall({ ...patch, status: 'ringing' })
  }
  if (eventType === 'call.answered') {
    const saved = upsertCall({ ...patch, status: 'answered', answeredAt: text(payload.start_time) || new Date().toISOString() })
    if (saved) void startRecordingForCall(saved.row.id).catch(() => undefined)
    return saved
  }
  if (eventType === 'call.hangup') {
    return upsertCall({
      ...patch,
      status: 'hangup',
      startedAt: text(payload.start_time),
      endedAt: text(payload.end_time) || new Date().toISOString(),
      hangupCause: text(payload.hangup_cause) || text(payload.hangup_cause_code),
    })
  }
  if (eventType === 'call.recording.saved') {
    const saved = upsertCall(patch)
    const recordingId = text(payload.recording_id)
    if (saved && recordingId) {
      const recording = saveCallRecording(saved.row.id, recordingFromWebhook(payload, recordingId))
      void downloadRecordingFile(recording.id).catch(() => undefined)
    }
    return saved
  }
  if (eventType === 'call.recording.error') {
    const saved = upsertCall(patch)
    if (saved) {
      markRecordingFailed(saved.row.id, text(payload.reason) || text(payload.error) || 'Telnyx could not record this call.')
    }
    return saved
  }
  if (eventType === 'call.cost') {
    const cost = costFromPayload(payload)
    if (!cost) return null
    return upsertCall({
      ...patch,
      costAmount: cost.amount,
      currency: cost.currency,
      billableSeconds: cost.billableSeconds,
    })
  }
  return null
}

export async function startRecordingForCall(callId: number) {
  if (recordingDisabled()) return null
  const found = getCall(callId)
  if (!found) return null
  const { row } = found
  if (row.status !== 'answered' || !row.call_control_id) return null
  if (!claimRecordingStart(callId)) return recordingForCall(callId)
  try {
    await telnyx(`/calls/${encodeURIComponent(row.call_control_id)}/actions/record_start`, {
      method: 'POST',
      body: {
        format: 'mp3',
        channels: 'dual',
        play_beep: false,
        command_id: `desk-recording-${callId}`,
      },
    })
    markRecordingStarted(callId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Telnyx did not start the recording.'
    if (/already.*record|record.*already/i.test(message)) markRecordingStarted(callId)
    else markRecordingFailed(callId, message)
  }
  return recordingForCall(callId)
}

export async function syncTelnyxRecordings() {
  required('TELNYX_API_KEY')
  const calls = recordingCandidates(30, 50)
  let found = 0
  let downloaded = 0
  const errors: string[] = []
  for (const call of calls) {
    try {
      const record = await findTelnyxRecording(call.call_session_id, call.call_leg_id, call.call_control_id)
      if (!record) continue
      found += 1
      const saved = saveCallRecording(call.id, recordingFromRecord(record))
      if (await downloadRecordingFile(saved.id)) downloaded += 1
    } catch (error) {
      if (errors.length < 5) errors.push(error instanceof Error ? error.message : 'Telnyx lookup failed.')
    }
  }
  return { checked: calls.length, found, downloaded, errors }
}

export async function recordingAudio(id: number) {
  const row = recordingRow(id)
  if (!row) throw httpError('No recording with that id.', 404)
  if (row.local_path && existsSync(row.local_path)) {
    return {
      buffer: readFileSync(row.local_path),
      contentType: contentFor(row.format),
      filename: `call-${row.call_id}.${extensionFor(row.format)}`,
    }
  }
  const buffer = await downloadRecordingFile(id)
  if (!buffer) throw httpError('Telnyx has not delivered this recording yet. Try Sync from Telnyx.', 404)
  const fresh = recordingRow(id) ?? row
  return {
    buffer,
    contentType: contentFor(fresh.format),
    filename: `call-${fresh.call_id}.${extensionFor(fresh.format)}`,
  }
}

export async function downloadRecordingFile(id: number): Promise<Buffer | null> {
  const row = recordingRow(id)
  if (!row) return null
  if (row.local_path && existsSync(row.local_path)) return readFileSync(row.local_path)
  if (!row.recording_id) return null
  let bytes = row.remote_url ? await fetchAudio(row.remote_url) : null
  if (!bytes) {
    const url = await freshRecordingUrl(row.recording_id)
    if (url) bytes = await fetchAudio(url)
  }
  if (!bytes) return null
  mkdirSync(recordingDir, { recursive: true })
  const filename = `${row.id}-${safeName(row.recording_id)}.${extensionFor(row.format)}`
  const path = join(recordingDir, filename)
  writeFileSync(path, bytes)
  setRecordingFile(row.id, path, bytes.length)
  return bytes
}

function recordingFromWebhook(payload: Record<string, unknown>, recordingId: string): RecordingInput {
  const urls = objectOf(payload.recording_urls)
  const mp3 = text(urls.mp3)
  const wav = text(urls.wav)
  const format = text(payload.format) || (mp3 ? 'mp3' : wav ? 'wav' : 'mp3')
  const started = text(payload.recording_started_at)
  const ended = text(payload.recording_ended_at)
  const reported = Number(payload.duration_millis)
  return {
    recordingId,
    status: 'ready',
    format,
    channels: text(payload.channels),
    durationMillis: Number.isFinite(reported) && reported > 0 ? Math.round(reported) : millisecondsBetween(started, ended),
    remoteUrl: format === 'wav' ? (wav || mp3) : (mp3 || wav),
    recordingStartedAt: started,
    recordingEndedAt: ended,
  }
}

function recordingFromRecord(record: Record<string, unknown>): RecordingInput {
  const urls = objectOf(record.download_urls)
  const mp3 = text(urls.mp3)
  const wav = text(urls.wav)
  const format = mp3 ? 'mp3' : wav ? 'wav' : 'mp3'
  const reported = Number(record.duration_millis)
  return {
    recordingId: text(record.id),
    status: 'ready',
    format,
    channels: text(record.channels),
    durationMillis: Number.isFinite(reported) && reported > 0 ? Math.round(reported) : null,
    remoteUrl: format === 'wav' ? wav : mp3,
    recordingStartedAt: text(record.recording_started_at),
    recordingEndedAt: text(record.recording_ended_at),
  }
}

async function findTelnyxRecording(sessionId: string | null, legId: string | null, controlId: string | null) {
  const filters: [string, string][] = ([
    ['call_session_id', sessionId],
    ['call_leg_id', legId],
    ['call_control_id', controlId],
  ] as [string, string | null][]).filter((entry): entry is [string, string] => Boolean(entry[1]))
  const lookups = filters.map(async ([field, value]) => {
    try {
      const params = new URLSearchParams({ [`filter[${field}]`]: value, 'page[size]': '10' })
      const body = await telnyx(`/recordings?${params.toString()}`) as { data?: Record<string, unknown>[] }
      return (body.data ?? []).find((record) => text(record.id) && (text(objectOf(record.download_urls).mp3) || text(objectOf(record.download_urls).wav))) ?? null
    } catch {
      return null
    }
  })
  const found = await Promise.all(lookups)
  return found.find((record) => record != null) ?? null
}

const pendingReconciles = new Set<number>()

export function scheduleRecordingReconcile(callId: number) {
  if (recordingDisabled()) return
  if (pendingReconciles.has(callId)) return
  const recording = recordingForCall(callId)
  if (recording && (recording.status === 'ready' || recording.status === 'recording')) return
  pendingReconciles.add(callId)
  const timer = setTimeout(() => {
    pendingReconciles.delete(callId)
    void reconcileCallRecording(callId).catch(() => undefined)
  }, 10000)
  timer.unref()
}

export async function reconcileCallRecording(callId: number) {
  const found = getCall(callId)
  if (!found) return false
  const existing = recordingForCall(callId)
  if (existing?.status === 'ready') return true
  const { row } = found
  const record = await findTelnyxRecording(row.call_session_id, row.call_leg_id, row.call_control_id)
  if (!record) return false
  const saved = saveCallRecording(callId, recordingFromRecord(record))
  await downloadRecordingFile(saved.id)
  return true
}

async function freshRecordingUrl(recordingId: string) {
  try {
    const body = await telnyx(`/recordings/${encodeURIComponent(recordingId)}`) as {
      data?: { download_urls?: { mp3?: string, wav?: string } }
    }
    return body.data?.download_urls?.mp3 || body.data?.download_urls?.wav || null
  } catch {
    return null
  }
}

async function fetchAudio(url: string) {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    return buffer.length ? buffer : null
  } catch {
    return null
  }
}

function recordingDisabled() {
  const value = (process.env.TELNYX_RECORDING || '').trim().toLowerCase()
  return value === 'off' || value === 'false' || value === '0' || value === 'no'
}

function millisecondsBetween(start: string | null, end: string | null) {
  if (!start || !end) return null
  const millis = Date.parse(end) - Date.parse(start)
  return Number.isFinite(millis) && millis > 0 ? millis : null
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function safeName(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 120) || 'recording'
}

function extensionFor(format: string | null) {
  return format === 'wav' ? 'wav' : 'mp3'
}

function contentFor(format: string | null) {
  return format === 'wav' ? 'audio/wav' : 'audio/mpeg'
}

export async function loginToken() {
  const callerNumber = required('TELNYX_PHONE_NUMBER')
  required('TELNYX_API_KEY')
  required('TELNYX_CONNECTION_ID')
  const fromFile = readCredentialId()
  const fromEnv = process.env.TELNYX_TELEPHONY_CREDENTIAL_ID?.trim() || ''
  const candidates = [fromFile, fromEnv].filter((id, index, all) => id && all.indexOf(id) === index)
  for (const credentialId of candidates) {
    try {
      return { token: await requestToken(credentialId), callerNumber }
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status !== 400 && status !== 404) throw error
    }
  }
  const credentialId = await createCredential()
  await delay(5000)
  return { token: await requestToken(credentialId), callerNumber }
}

export async function refreshCallCost(id: number) {
  const found = getCall(id)
  if (!found) {
    const error = new Error('No call with that id.') as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }
  const ids = [found.row.call_session_id, found.row.call_leg_id, found.row.call_control_id, found.row.client_call_id]
    .filter((value): value is string => Boolean(value))
  if (!ids.length) {
    const error = new Error('This call has no Telnyx id yet.') as Error & { statusCode?: number }
    error.statusCode = 409
    throw error
  }
  required('TELNYX_API_KEY')
  const started = Date.parse(found.row.started_at ?? found.row.created_at)
  const range = Number.isFinite(started) && Date.now() - started > 7 * 24 * 60 * 60 * 1000 ? 'last_30_days' : 'last_7_days'
  const records = [
    ...await searchRecords('webrtc', range),
    ...await searchRecords('sip-trunking', range),
  ].filter((record) => recordMatches(record, ids))
  const cost = combineCosts(records)
  if (!cost) {
    const error = new Error('Telnyx has no priced detail record for this call yet.') as Error & { statusCode?: number }
    error.statusCode = 404
    throw error
  }
  return setCallCost(found.row.id, cost.amount, cost.currency, cost.billableSeconds).json
}

async function createCredential() {
  const body = await telnyx('/telephony_credentials', {
    method: 'POST',
    body: { connection_id: required('TELNYX_CONNECTION_ID'), name: 'desk' },
  })
  const id = body.data?.id
  if (typeof id !== 'string' || !id) throw httpError('Telnyx did not return a telephony credential id.', 502)
  writeFileSync(credentialFile, id)
  return id
}

function readCredentialId() {
  if (!existsSync(credentialFile)) return ''
  return readFileSync(credentialFile, 'utf8').trim()
}

async function requestToken(id: string) {
  const response = await fetch(`https://api.telnyx.com/v2/telephony_credentials/${id}/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${required('TELNYX_API_KEY')}` },
  })
  const text = await response.text()
  if (!response.ok) {
    const error = httpError(telnyxMessage(text, response.status), response.status)
    ;(error as { status?: number }).status = response.status
    throw error
  }
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    const json = JSON.parse(trimmed) as { data?: { token?: string }, token?: string }
    const token = json.data?.token || json.token
    if (token) return token
  }
  return trimmed.replace(/^"|"$/g, '')
}

async function searchRecords(recordType: string, dateRange: string) {
  const records: Record<string, unknown>[] = []
  for (let page = 1; page <= 5; page += 1) {
    const params = new URLSearchParams({
      'filter[record_type]': recordType,
      'filter[date_range]': dateRange,
      'page[size]': '50',
      'page[number]': String(page),
    })
    let body: { data?: Record<string, unknown>[], meta?: { total_pages?: number } }
    try {
      body = await telnyx(`/detail_records?${params.toString()}`)
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      if (status === 400) return records
      throw error
    }
    records.push(...(body.data ?? []))
    if (page >= (body.meta?.total_pages ?? 1)) break
  }
  return records
}

export async function searchAvailableNumbers(query: { country: string, area?: string, contains?: string, limit?: number }) {
  const params = new URLSearchParams({
    'filter[country_code]': query.country,
    'filter[limit]': String(query.limit ?? 24),
    'filter[best_effort]': 'true',
  })
  if (query.area) params.set('filter[national_destination_code]', query.area)
  if (query.contains) params.set('filter[phone_number][contains]', query.contains.replace(/\D/g, ''))
  try {
    const body = await telnyx(`/available_phone_numbers?${params}`) as {
    data?: {
      phone_number?: string
      phone_number_type?: string
      cost_information?: { upfront_cost?: string, monthly_cost?: string, currency?: string }
      region_information?: { region_name?: string }[]
      features?: { name?: string }[]
    }[]
  }
  return (body.data ?? []).map((item) => ({
    phoneNumber: item.phone_number ?? '',
    type: item.phone_number_type ?? '',
    region: [...new Set((item.region_information ?? []).map((region) => region.region_name).filter((name): name is string => Boolean(name)))].join(', '),
    upfrontCost: item.cost_information?.upfront_cost ?? '0.0000',
    monthlyCost: item.cost_information?.monthly_cost ?? '0.0000',
    currency: item.cost_information?.currency ?? 'USD',
    features: (item.features ?? []).map((feature) => feature.name).filter(Boolean),
  })).filter((item) => item.phoneNumber)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.toLowerCase().includes('no numbers found')) return []
    throw error
  }
}

export async function orderPhoneNumber(phoneNumber: string) {
  await telnyx('/number_orders', {
    method: 'POST',
    body: {
      phone_numbers: [{ phone_number: phoneNumber }],
      connection_id: required('TELNYX_CONNECTION_ID'),
    },
  })
}

async function telnyx(path: string, options: { method?: string, body?: unknown } = {}): Promise<any> {
  let response: Response
  try {
    response = await fetch(`https://api.telnyx.com/v2${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${required('TELNYX_API_KEY')}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(15000),
    })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw httpError('Telnyx took too long to respond. Try again.', 504)
    }
    throw error
  }
  const text = await response.text()
  if (!response.ok) throw httpError(telnyxMessage(text, response.status), response.status)
  return text ? JSON.parse(text) as { data?: { id?: string }, meta?: { total_pages?: number } } : {}
}

function telnyxMessage(text: string, status: number) {
  try {
    const json = JSON.parse(text) as { errors?: { detail?: string }[] }
    const detail = json.errors?.map((error) => error.detail).filter(Boolean).join(' ')
    if (detail) return detail
  } catch {
    // Telnyx sometimes returns plain text.
  }
  return text.trim() || `Telnyx returned ${status}.`
}

function httpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode?: number }
  error.statusCode = statusCode
  return error
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
