import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { durationSeconds, nextStatus, toUnits } from './logic.ts'

mkdirSync('data', { recursive: true })

export const db = new DatabaseSync('data/app.db')
db.exec(`
PRAGMA journal_mode = DELETE;
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY,
  client_call_id TEXT UNIQUE,
  call_session_id TEXT UNIQUE,
  call_leg_id TEXT,
  call_control_id TEXT,
  direction TEXT,
  from_number TEXT,
  to_number TEXT,
  status TEXT NOT NULL DEFAULT 'initiated',
  started_at TEXT,
  answered_at TEXT,
  ended_at TEXT,
  duration_seconds INTEGER,
  billable_seconds INTEGER,
  cost_amount TEXT,
  currency TEXT,
  hangup_cause TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wa_chats (
  jid TEXT PRIMARY KEY,
  display_name TEXT,
  summary_text TEXT,
  summary_model TEXT,
  summary_at TEXT,
  summary_message_count INTEGER
);
CREATE TABLE IF NOT EXISTS wa_messages (
  id INTEGER PRIMARY KEY,
  wa_message_id TEXT UNIQUE,
  chat_jid TEXT NOT NULL,
  sender TEXT,
  push_name TEXT,
  body TEXT NOT NULL,
  timestamp TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS wa_messages_chat ON wa_messages (chat_jid, timestamp);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wa_replies (
  inbound_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  balance_units INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount_units INTEGER NOT NULL,
  note TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by INTEGER
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount_units INTEGER NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS owned_numbers (
  phone_number TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  region TEXT,
  upfront_cost TEXT,
  monthly_cost TEXT,
  currency TEXT,
  ordered_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS call_recordings (
  id INTEGER PRIMARY KEY,
  call_id INTEGER NOT NULL UNIQUE,
  recording_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'requesting',
  error TEXT,
  format TEXT,
  channels TEXT,
  duration_millis INTEGER,
  size_bytes INTEGER,
  local_path TEXT,
  remote_url TEXT,
  recording_started_at TEXT,
  recording_ended_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS call_recordings_status ON call_recordings (status);
`)

const messageColumns = db.prepare('PRAGMA table_info(wa_messages)').all() as { name: string }[]
if (!messageColumns.some((column) => column.name === 'from_me')) {
  db.exec('ALTER TABLE wa_messages ADD COLUMN from_me INTEGER NOT NULL DEFAULT 0')
}
if (!messageColumns.some((column) => column.name === 'source')) {
  db.exec("ALTER TABLE wa_messages ADD COLUMN source TEXT NOT NULL DEFAULT 'user'")
}

const callColumns = db.prepare('PRAGMA table_info(calls)').all() as { name: string }[]
if (!callColumns.some((column) => column.name === 'user_id')) {
  db.exec('ALTER TABLE calls ADD COLUMN user_id INTEGER')
}
if (!callColumns.some((column) => column.name === 'charged')) {
  db.exec('ALTER TABLE calls ADD COLUMN charged INTEGER NOT NULL DEFAULT 0')
}

export type CallRow = {
  id: number
  client_call_id: string | null
  call_session_id: string | null
  call_leg_id: string | null
  call_control_id: string | null
  direction: string | null
  from_number: string | null
  to_number: string | null
  status: string
  started_at: string | null
  answered_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  billable_seconds: number | null
  cost_amount: string | null
  currency: string | null
  hangup_cause: string | null
  created_at: string
  user_id?: number | null
  charged?: number | null
}

export type CallPatch = {
  clientCallId?: string | null
  callSessionId?: string | null
  callLegId?: string | null
  callControlId?: string | null
  direction?: string | null
  from?: string | null
  to?: string | null
  status?: string | null
  startedAt?: string | null
  answeredAt?: string | null
  endedAt?: string | null
  hangupCause?: string | null
  costAmount?: string | null
  currency?: string | null
  billableSeconds?: number | null
}

export function callJson(row: CallRow) {
  return {
    id: row.id,
    direction: row.direction,
    from: row.from_number,
    to: row.to_number,
    status: row.status,
    startedAt: row.started_at,
    answeredAt: row.answered_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    billableSeconds: row.billable_seconds,
    costAmount: row.cost_amount,
    currency: row.currency,
    hangupCause: row.hangup_cause,
  }
}

export function listCalls(userId: number) {
  return db.prepare(`
    SELECT * FROM calls
    WHERE user_id = ?
    ORDER BY COALESCE(started_at, created_at) DESC
    LIMIT 200
  `).all(userId).map((row) => callJson(row as CallRow))
}

export function getCall(id: number) {
  const row = db.prepare('SELECT * FROM calls WHERE id = ?').get(id) as CallRow | undefined
  return row ? { row, json: callJson(row) } : null
}

export function upsertCall(patch: CallPatch, userId?: number) {
  const existing = findCall(patch)
  const status = patch.status ? nextStatus(existing?.status ?? null, patch.status) : existing?.status ?? 'initiated'
  const answeredAt = patch.answeredAt || existing?.answered_at || null
  const endedAt = patch.endedAt || existing?.ended_at || null
  const finished = status === 'hangup' || status === 'failed'
  const duration = finished ? durationSeconds(answeredAt, endedAt) : existing?.duration_seconds ?? null
  const values = {
    client_call_id: patch.clientCallId || existing?.client_call_id || null,
    call_session_id: patch.callSessionId || existing?.call_session_id || null,
    call_leg_id: patch.callLegId || existing?.call_leg_id || null,
    call_control_id: patch.callControlId || existing?.call_control_id || null,
    direction: patch.direction || existing?.direction || null,
    from_number: patch.from || existing?.from_number || null,
    to_number: patch.to || existing?.to_number || null,
    status,
    started_at: patch.startedAt || existing?.started_at || new Date().toISOString(),
    answered_at: answeredAt,
    ended_at: endedAt,
    duration_seconds: duration,
    billable_seconds: patch.billableSeconds ?? existing?.billable_seconds ?? null,
    cost_amount: patch.costAmount || existing?.cost_amount || null,
    currency: patch.currency || existing?.currency || null,
    hangup_cause: patch.hangupCause || existing?.hangup_cause || null,
  }
  if (!existing) {
    const result = db.prepare(`
      INSERT INTO calls (
        client_call_id, call_session_id, call_leg_id, call_control_id, direction,
        from_number, to_number, status, started_at, answered_at, ended_at,
        duration_seconds, billable_seconds, cost_amount, currency, hangup_cause, created_at, user_id
      ) VALUES (
        :client_call_id, :call_session_id, :call_leg_id, :call_control_id, :direction,
        :from_number, :to_number, :status, :started_at, :answered_at, :ended_at,
        :duration_seconds, :billable_seconds, :cost_amount, :currency, :hangup_cause, :created_at, :user_id
      )
    `).run({ ...values, created_at: new Date().toISOString(), user_id: userId ?? null })
    return getCall(Number(result.lastInsertRowid))!
  }
  db.prepare(`
    UPDATE calls SET
      client_call_id = :client_call_id,
      call_session_id = :call_session_id,
      call_leg_id = :call_leg_id,
      call_control_id = :call_control_id,
      direction = :direction,
      from_number = :from_number,
      to_number = :to_number,
      status = :status,
      started_at = :started_at,
      answered_at = :answered_at,
      ended_at = :ended_at,
      duration_seconds = :duration_seconds,
      billable_seconds = :billable_seconds,
      cost_amount = :cost_amount,
      currency = :currency,
      hangup_cause = :hangup_cause,
      user_id = COALESCE(user_id, :user_id)
    WHERE id = :id
  `).run({ ...values, id: existing.id, user_id: userId ?? null })
  return getCall(existing.id)!
}

function findCall(patch: CallPatch): CallRow | null {
  const lookups: [string, string | null | undefined][] = [
    ['call_session_id', patch.callSessionId],
    ['client_call_id', patch.clientCallId],
    ['call_control_id', patch.callControlId],
    ['call_leg_id', patch.callLegId],
  ]
  for (const [column, value] of lookups) {
    if (!value) continue
    const row = db.prepare(`SELECT * FROM calls WHERE ${column} = ?`).get(value) as CallRow | undefined
    if (row) return row
  }
  if (patch.to && patch.callSessionId) {
    const row = db.prepare(`
      SELECT * FROM calls
      WHERE to_number = ? AND call_session_id IS NULL
      ORDER BY id DESC
      LIMIT 1
    `).get(patch.to) as CallRow | undefined
    const age = row ? Date.now() - Date.parse(row.created_at) : Number.POSITIVE_INFINITY
    if (row && age >= 0 && age < 2 * 60 * 1000) return row
  }
  return null
}

export function setCallCost(id: number, amount: string, currency: string | null, billableSeconds: number | null) {
  db.exec('BEGIN')
  try {
    const row = db.prepare('SELECT user_id, charged FROM calls WHERE id = ?').get(id) as { user_id: number | null, charged: number } | undefined
    db.prepare(`
      UPDATE calls
      SET cost_amount = ?, currency = ?, billable_seconds = COALESCE(?, billable_seconds)
      WHERE id = ?
    `).run(amount, currency, billableSeconds, id)
    const units = toUnits(amount) ?? 0
    if (row?.user_id && !row.charged && units > 0) {
      db.prepare('UPDATE users SET balance_units = balance_units - ? WHERE id = ?').run(units, row.user_id)
      db.prepare(`
        INSERT INTO ledger (user_id, amount_units, kind, ref, note, created_at)
        VALUES (?, ?, 'call', ?, 'Call', ?)
      `).run(row.user_id, -units, String(id), new Date().toISOString())
      db.prepare('UPDATE calls SET charged = 1 WHERE id = ?').run(id)
    } else if (row && !row.charged) {
      db.prepare('UPDATE calls SET charged = 1 WHERE id = ?').run(id)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return getCall(id)!
}

export function homeTotals() {
  const time = db.prepare(`
    SELECT
      COALESCE(SUM(duration_seconds), 0) AS seconds,
      SUM(CASE WHEN status = 'hangup' AND cost_amount IS NULL THEN 1 ELSE 0 END) AS pending
    FROM calls
  `).get() as { seconds: number, pending: number | null }
  const costs = db.prepare(`
    SELECT COALESCE(currency, '') AS currency, SUM(CAST(cost_amount AS REAL)) AS amount
    FROM calls
    WHERE cost_amount IS NOT NULL
    GROUP BY currency
  `).all() as { currency: string, amount: number }[]
  const texts = db.prepare('SELECT COUNT(*) AS count FROM wa_messages WHERE from_me = 0').get() as { count: number }
  return {
    durationSeconds: time.seconds ?? 0,
    pendingCostCount: time.pending ?? 0,
    costs: costs.map((row) => ({ currency: row.currency || null, amount: Number(row.amount).toFixed(4) })),
    inboundTextCount: Number(texts.count ?? 0),
  }
}

export function saveText(input: {
  waMessageId: string
  chatJid: string
  sender: string | null
  pushName: string | null
  body: string
  timestamp: string
  displayName: string | null
  fromMe: boolean
  source: 'user' | 'auto'
}) {
  db.exec('BEGIN')
  try {
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO wa_messages (
        wa_message_id, chat_jid, sender, push_name, body, timestamp, from_me, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.waMessageId,
      input.chatJid,
      input.sender,
      input.pushName,
      input.body,
      input.timestamp,
      input.fromMe ? 1 : 0,
      input.source,
    )
    if (Number(inserted.changes) > 0 && input.displayName) {
      db.prepare(`
        INSERT INTO wa_chats (jid, display_name) VALUES (?, ?)
        ON CONFLICT(jid) DO UPDATE SET
          display_name = COALESCE(wa_chats.display_name, excluded.display_name)
      `).run(input.chatJid, input.displayName)
    } else if (Number(inserted.changes) > 0) {
      db.prepare('INSERT OR IGNORE INTO wa_chats (jid) VALUES (?)').run(input.chatJid)
    }
    db.exec('COMMIT')
    return Number(inserted.changes) > 0
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function setChatName(jid: string, name: string) {
  db.prepare(`
    INSERT INTO wa_chats (jid, display_name) VALUES (?, ?)
    ON CONFLICT(jid) DO UPDATE SET display_name = excluded.display_name
  `).run(jid, name)
}

export function listChats() {
  return db.prepare(`
    SELECT
      m.chat_jid AS jid,
      c.display_name AS display_name,
      SUM(CASE WHEN m.from_me = 0 THEN 1 ELSE 0 END) AS message_count,
      COUNT(*) AS transcript_count,
      MIN(m.timestamp) AS first_message_at,
      MAX(m.timestamp) AS last_message_at,
      c.summary_text AS summary_text,
      c.summary_model AS summary_model,
      c.summary_at AS summary_at,
      c.summary_message_count AS summary_message_count
    FROM wa_messages m
    LEFT JOIN wa_chats c ON c.jid = m.chat_jid
    GROUP BY m.chat_jid
    ORDER BY last_message_at DESC
  `).all().map((row) => {
    const chat = row as {
      jid: string
      display_name: string | null
      message_count: number
      transcript_count: number
      first_message_at: string
      last_message_at: string
      summary_text: string | null
      summary_model: string | null
      summary_at: string | null
      summary_message_count: number | null
    }
    const last = db.prepare(`
      SELECT body FROM wa_messages WHERE chat_jid = ? ORDER BY timestamp DESC LIMIT 1
    `).get(chat.jid) as { body: string } | undefined
    return {
      jid: chat.jid,
      displayName: chat.display_name,
      messageCount: Number(chat.message_count),
      transcriptCount: Number(chat.transcript_count),
      firstMessageAt: chat.first_message_at,
      lastMessageAt: chat.last_message_at,
      lastText: last?.body ?? '',
      summaryText: chat.summary_text,
      summaryModel: chat.summary_model,
      summaryAt: chat.summary_at,
      summaryMessageCount: chat.summary_message_count,
      summaryStale: Boolean(chat.summary_text) && Number(chat.summary_message_count) !== Number(chat.transcript_count),
    }
  })
}

export function listMessages(jid: string) {
  return db.prepare(`
    SELECT id, sender, push_name, body, timestamp, from_me
    FROM wa_messages
    WHERE chat_jid = ?
    ORDER BY timestamp ASC
  `).all(jid).map((row) => {
    const message = row as { id: number, sender: string | null, push_name: string | null, body: string, timestamp: string, from_me: number }
    return {
      id: message.id,
      sender: message.sender,
      pushName: message.push_name,
      body: message.body,
      timestamp: message.timestamp,
      fromMe: message.from_me === 1,
    }
  })
}

export function saveSummary(jid: string, text: string, model: string, messageCount: number) {
  db.prepare(`
    INSERT INTO wa_chats (jid, summary_text, summary_model, summary_at, summary_message_count)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET
      summary_text = excluded.summary_text,
      summary_model = excluded.summary_model,
      summary_at = excluded.summary_at,
      summary_message_count = excluded.summary_message_count
  `).run(jid, text, model, new Date().toISOString(), messageCount)
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string) {
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

export function listReplyRows() {
  return db.prepare(`
    SELECT chat_jid, body, from_me, source
    FROM (
      SELECT chat_jid, body, from_me, source, timestamp
      FROM wa_messages
      ORDER BY timestamp DESC
      LIMIT 500
    )
    ORDER BY timestamp ASC
  `).all().map((row) => {
    const message = row as { chat_jid: string, body: string, from_me: number, source: string }
    return {
      chatJid: message.chat_jid,
      body: message.body,
      fromMe: message.from_me === 1,
      source: message.source || 'user',
    }
  })
}

export function recentChat(jid: string, limit: number) {
  const rows = db.prepare(`
    SELECT body, from_me FROM wa_messages
    WHERE chat_jid = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(jid, limit) as { body: string, from_me: number }[]
  return rows.reverse().map((row) => ({ body: row.body, fromMe: row.from_me === 1 }))
}

export function listHistoryAnchors() {
  return db.prepare(`
    SELECT chat_jid, wa_message_id, from_me, timestamp
    FROM wa_messages
    WHERE id IN (SELECT MIN(id) FROM wa_messages GROUP BY chat_jid)
  `).all() as { chat_jid: string, wa_message_id: string, from_me: number, timestamp: string }[]
}

export function listUnanswered(sinceIso: string) {
  return db.prepare(`
    SELECT chat_jid, wa_message_id, body, timestamp
    FROM wa_messages m
    WHERE from_me = 0
      AND chat_jid NOT LIKE '%@g.us'
      AND chat_jid NOT LIKE '%@broadcast'
      AND timestamp >= ?
      AND timestamp = (
        SELECT MAX(timestamp) FROM wa_messages
        WHERE chat_jid = m.chat_jid AND from_me = 0
      )
      AND NOT EXISTS (
        SELECT 1 FROM wa_messages u
        WHERE u.chat_jid = m.chat_jid AND u.timestamp > m.timestamp AND u.from_me = 1 AND u.source = 'user'
      )
      AND NOT EXISTS (
        SELECT 1 FROM wa_replies r WHERE r.inbound_id = m.wa_message_id
      )
  `).all(sinceIso) as { chat_jid: string, wa_message_id: string, body: string, timestamp: string }[]
}

export function userRepliedAfter(jid: string, timestamp: string) {
  const row = db.prepare(`
    SELECT 1 AS hit FROM wa_messages
    WHERE chat_jid = ? AND timestamp > ? AND from_me = 1 AND source = 'user'
    LIMIT 1
  `).get(jid, timestamp) as { hit: number } | undefined
  return Boolean(row)
}

export function hasReplied(inboundId: string) {
  return Boolean(db.prepare('SELECT 1 AS hit FROM wa_replies WHERE inbound_id = ?').get(inboundId))
}

export function markReplied(inboundId: string) {
  db.prepare('INSERT OR IGNORE INTO wa_replies (inbound_id, created_at) VALUES (?, ?)').run(inboundId, new Date().toISOString())
}

export type CallRecordingRow = {
  id: number
  call_id: number
  recording_id: string | null
  status: string
  error: string | null
  format: string | null
  channels: string | null
  duration_millis: number | null
  size_bytes: number | null
  local_path: string | null
  remote_url: string | null
  recording_started_at: string | null
  recording_ended_at: string | null
  attempts: number
  created_at: string
  updated_at: string
}

export type RecordingInput = {
  recordingId: string | null
  status?: string
  format?: string | null
  channels?: string | null
  durationMillis?: number | null
  remoteUrl?: string | null
  recordingStartedAt?: string | null
  recordingEndedAt?: string | null
}

export function recordingForCall(callId: number): CallRecordingRow | null {
  const row = db.prepare('SELECT * FROM call_recordings WHERE call_id = ?').get(callId) as CallRecordingRow | undefined
  return row ?? null
}

export function recordingRow(id: number): CallRecordingRow | null {
  const row = db.prepare('SELECT * FROM call_recordings WHERE id = ?').get(id) as CallRecordingRow | undefined
  return row ?? null
}

export function claimRecordingStart(callId: number): CallRecordingRow | null {
  const now = new Date().toISOString()
  const existing = recordingForCall(callId)
  if (existing) {
    if (existing.status !== 'failed' || existing.attempts >= 2) return null
    db.prepare(`
      UPDATE call_recordings
      SET status = 'requesting', error = NULL, attempts = attempts + 1, updated_at = ?
      WHERE id = ?
    `).run(now, existing.id)
    return recordingRow(existing.id)
  }
  const result = db.prepare(`
    INSERT INTO call_recordings (call_id, status, attempts, created_at, updated_at)
    VALUES (?, 'requesting', 1, ?, ?)
  `).run(callId, now, now)
  return recordingRow(Number(result.lastInsertRowid))
}

export function markRecordingStarted(callId: number) {
  db.prepare(`
    UPDATE call_recordings
    SET status = 'recording', error = NULL, updated_at = ?
    WHERE call_id = ? AND status <> 'ready'
  `).run(new Date().toISOString(), callId)
}

export function markRecordingFailed(callId: number, message: string) {
  const now = new Date().toISOString()
  const error = message.slice(0, 500)
  const existing = recordingForCall(callId)
  if (!existing) {
    db.prepare(`
      INSERT INTO call_recordings (call_id, status, error, created_at, updated_at)
      VALUES (?, 'failed', ?, ?, ?)
    `).run(callId, error, now, now)
    return
  }
  db.prepare(`
    UPDATE call_recordings
    SET status = 'failed', error = ?, updated_at = ?
    WHERE id = ? AND status <> 'ready'
  `).run(error, now, existing.id)
}

export function saveCallRecording(callId: number, input: RecordingInput): CallRecordingRow {
  const now = new Date().toISOString()
  const status = input.status ?? 'ready'
  const byRecording = input.recordingId
    ? db.prepare('SELECT * FROM call_recordings WHERE recording_id = ?').get(input.recordingId) as CallRecordingRow | undefined
    : undefined
  const byCall = recordingForCall(callId)
  if (byRecording && byCall && byRecording.id !== byCall.id) {
    db.prepare('DELETE FROM call_recordings WHERE id = ?').run(byCall.id)
  }
  const target = byRecording ?? byCall
  if (!target) {
    const result = db.prepare(`
      INSERT INTO call_recordings (
        call_id, recording_id, status, format, channels, duration_millis,
        remote_url, recording_started_at, recording_ended_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      callId,
      input.recordingId,
      status,
      input.format ?? null,
      input.channels ?? null,
      input.durationMillis ?? null,
      input.remoteUrl ?? null,
      input.recordingStartedAt ?? null,
      input.recordingEndedAt ?? null,
      now,
      now,
    )
    return recordingRow(Number(result.lastInsertRowid))!
  }
  db.prepare(`
    UPDATE call_recordings SET
      call_id = ?,
      recording_id = COALESCE(?, recording_id),
      status = ?,
      error = NULL,
      format = COALESCE(?, format),
      channels = COALESCE(?, channels),
      duration_millis = COALESCE(?, duration_millis),
      remote_url = COALESCE(?, remote_url),
      recording_started_at = COALESCE(?, recording_started_at),
      recording_ended_at = COALESCE(?, recording_ended_at),
      updated_at = ?
    WHERE id = ?
  `).run(
    callId,
    input.recordingId,
    status,
    input.format ?? null,
    input.channels ?? null,
    input.durationMillis ?? null,
    input.remoteUrl ?? null,
    input.recordingStartedAt ?? null,
    input.recordingEndedAt ?? null,
    now,
    target.id,
  )
  return recordingRow(target.id)!
}

export function setRecordingFile(id: number, localPath: string, sizeBytes: number) {
  db.prepare(`
    UPDATE call_recordings
    SET local_path = ?, size_bytes = ?, status = 'ready', updated_at = ?
    WHERE id = ?
  `).run(localPath, sizeBytes, new Date().toISOString(), id)
}

export function listAdminRecordings() {
  const rows = db.prepare(`
    SELECT
      c.id AS call_id,
      c.user_id,
      c.direction,
      c.from_number,
      c.to_number,
      c.status AS call_status,
      c.started_at AS call_started_at,
      c.duration_seconds,
      c.created_at AS call_created_at,
      u.name AS user_name,
      u.email AS user_email,
      r.id AS recording_row_id,
      r.recording_id AS telnyx_recording_id,
      r.status AS recording_status,
      r.error AS recording_error,
      r.format AS recording_format,
      r.channels AS recording_channels,
      r.duration_millis AS recording_duration_millis,
      r.size_bytes AS recording_size_bytes,
      r.local_path AS recording_local_path,
      r.recording_started_at AS recording_started_at,
      r.created_at AS recording_created_at
    FROM calls c
    LEFT JOIN call_recordings r ON r.call_id = c.id
    LEFT JOIN users u ON u.id = c.user_id
    ORDER BY COALESCE(c.started_at, c.created_at) DESC
    LIMIT 250
  `).all() as {
    call_id: number
    user_id: number | null
    direction: string | null
    from_number: string | null
    to_number: string | null
    call_status: string
    call_started_at: string | null
    duration_seconds: number | null
    call_created_at: string
    user_name: string | null
    user_email: string | null
    recording_row_id: number | null
    telnyx_recording_id: string | null
    recording_status: string | null
    recording_error: string | null
    recording_format: string | null
    recording_channels: string | null
    recording_duration_millis: number | null
    recording_size_bytes: number | null
    recording_local_path: string | null
    recording_started_at: string | null
    recording_created_at: string | null
  }[]
  return rows.map((row) => ({
    id: row.recording_row_id,
    callId: row.call_id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    direction: row.direction,
    from: row.from_number,
    to: row.to_number,
    callStatus: row.call_status,
    startedAt: row.call_started_at,
    durationSeconds: row.duration_seconds,
    status: row.recording_status ?? 'none',
    error: row.recording_error,
    format: row.recording_format,
    channels: row.recording_channels,
    durationMillis: row.recording_duration_millis,
    sizeBytes: row.recording_size_bytes,
    hasAudio: Boolean(row.recording_local_path) || row.recording_status === 'ready',
    createdAt: row.recording_created_at ?? row.call_created_at,
    recordingStartedAt: row.recording_started_at,
  }))
}

export function recordingCandidates(days = 30, limit = 50): CallRow[] {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  return db.prepare(`
    SELECT c.*
    FROM calls c
    LEFT JOIN call_recordings r ON r.call_id = c.id AND r.status = 'ready'
    WHERE c.status IN ('hangup', 'failed')
      AND c.created_at >= ?
      AND r.id IS NULL
      AND (c.call_session_id IS NOT NULL OR c.call_leg_id IS NOT NULL OR c.call_control_id IS NOT NULL)
    ORDER BY c.id DESC
    LIMIT ?
  `).all(since, limit) as CallRow[]
}
