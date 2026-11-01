// GitHub sync, for the GitHub Pages build of this fork (VITE_GH_SYNC=1).
//
// Pages serves static files only, so there is no openGym server to sync with. Instead the profile
// lives in one JSON file (profile.json) in a private GitHub repository, read and written through
// the GitHub REST API with a fine-grained token that is kept on each device. lib/api.js hands the
// few routes the store needs (/api/config, /api/me, /api/data, /api/data/rev, /api/logout) to
// ghRoute() below, which answers them the way api/server.js does, so the store's sync logic
// (revisions, conflicts, merging) runs unchanged. Every save is one commit, which also gives the
// profile a full history.
import { stampPut } from '../../../api/sync-stamps.js'

export const GH_BUILD = import.meta.env.VITE_GH_SYNC === '1'
export const GH_DEFAULT_REPO = import.meta.env.VITE_GH_REPO || ''
const KEY = 'gym_gh_sync'
const FILE = 'profile.json'
const API = 'https://api.github.com'
const WID_KEEP = 50

export function ghConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null')
    return c && typeof c.token === 'string' && c.token && typeof c.repo === 'string' && c.repo ? c : null
  } catch { return null }
}
export const ghActive = () => GH_BUILD && !!ghConfig()
export function ghDisconnect() { try { localStorage.removeItem(KEY) } catch { /* storage blocked */ } }
// What a sign-in failure left behind for the connect screen to explain.
const NOTE = 'gym_gh_sync_note'
export function ghNote() { try { return localStorage.getItem(NOTE) || '' } catch { return '' } }
const setNote = s => { try { if (s) localStorage.setItem(NOTE, s); else localStorage.removeItem(NOTE) } catch { /* storage blocked */ } }

const fail = (status, error, extra) => Object.assign(new Error(error), { status, data: Object.assign({ error }, extra) })

async function gh(cfg, path, { method = 'GET', body, raw = false } = {}) {
  const headers = {
    Authorization: 'Bearer ' + cfg.token,
    Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
  if (body) headers['Content-Type'] = 'application/json'
  // no-store: the contents API answers with a 60 s cache lifetime, and a cached copy is a stale
  // revision that makes every push from this device a conflict.
  return fetch(API + path, { method, headers, cache: 'no-store', body: body ? JSON.stringify(body) : undefined })
}

const refused = r => r.status === 401 || r.status === 403

async function denied(r) {
  let msg = ''
  try { msg = (await r.json()).message || '' } catch { /* not JSON */ }
  if (r.status === 403 && /rate limit/i.test(msg)) return fail(429, 'GitHub is limiting requests for a few minutes. Your changes are kept on this device and will sync after that.')
  const note = 'GitHub refused the saved token. It may have expired or been regenerated. Paste a new one to keep syncing.'
  setNote(note)
  return fail(401, note)
}

const b64encode = s => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
const b64decode = b => {
  const bin = atob(String(b).replace(/\s/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

// The stored document and the blob sha a write must name. null doc: nothing saved yet.
async function readDoc(cfg) {
  const path = `/repos/${cfg.repo}/contents/${FILE}?ref=${encodeURIComponent(cfg.branch)}`
  const r = await gh(cfg, path)
  if (r.status === 404) return { doc: null, sha: null }
  if (refused(r)) throw await denied(r)
  if (!r.ok) throw fail(r.status, 'GitHub answered ' + r.status + ' while reading your data.')
  const meta = await r.json()
  let text
  // Files over 1 MB come without their content in this answer; the raw media type has it.
  if (meta.content && meta.encoding === 'base64') text = b64decode(meta.content)
  else {
    const rr = await gh(cfg, path, { raw: true })
    if (!rr.ok) throw fail(rr.status, 'GitHub answered ' + rr.status + ' while reading your data.')
    text = await rr.text()
  }
  let doc
  try { doc = JSON.parse(text) } catch { throw fail(503, 'state unreadable') }
  return { doc: doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : null, sha: meta.sha }
}

// The branch head and the revision it holds, so the half-minute poll costs one small request.
let head = null   // { repo, commit, rev, wid }
async function headCommit(cfg) {
  const r = await gh(cfg, `/repos/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`)
  if (refused(r)) throw await denied(r)
  if (r.status === 404 || r.status === 409) return null   // an empty repository
  if (!r.ok) throw fail(r.status, 'GitHub answered ' + r.status + '.')
  return (await r.json()).object?.sha || null
}

const forClient = S => {
  if (!S || typeof S !== 'object' || !('_unstamped' in S || '_prior' in S)) return S
  const { _unstamped, _prior, ...rest } = S
  return rest
}
const record = x => !!x && typeof x === 'object' && !Array.isArray(x)
const records = v => (Array.isArray(v) ? v.filter(record) : [])
const randomHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('')

// PUT /api/data as api/server.js answers it: a conditional write on the revision, with the
// server's stamping of what the writer left out, then one commit.
async function putData(cfg, body) {
  if (!body || !body.state || typeof body.state !== 'object') throw fail(400, 'state required')
  if (!Array.isArray(body.state) && !Object.keys(body.state).some(k => k !== '_rev' && k !== '_ts')) throw fail(400, 'state required')
  const list = v => v == null || Array.isArray(v)
  if (Array.isArray(body.state) || !list(body.state.workouts) || !list(body.state.routines)) throw fail(400, 'invalid state')
  for (const k of ['workouts', 'routines']) if (Array.isArray(body.state[k])) body.state[k] = records(body.state[k])
  for (let attempt = 0; ; attempt++) {
    const { doc: cur, sha } = await readDoc(cfg)
    const curRev = cur?._rev || 0
    if ((body.baseRev != null && body.baseRev !== curRev) ||
        (body.baseRev != null && typeof body.baseWid === 'string' && cur?._wid && body.baseWid !== cur._wid)) {
      throw fail(409, 'conflict', { rev: curRev, state: forClient(cur) })
    }
    const next = JSON.parse(JSON.stringify(body.state))
    delete next.active   // in-progress workouts stay device-local
    const storedReset = Number(cur?.resetAt) || 0
    if (storedReset > (Number(next.resetAt) || 0)) {
      next.resetAt = cur.resetAt
      if (cur.resetIds && typeof cur.resetIds === 'object') next.resetIds = cur.resetIds
      else delete next.resetIds
    }
    const report = {}
    try { stampPut(cur, next, { overRead: body.baseRev != null && body.baseRev === curRev, stamped: body.stamped === true, report }) }
    catch (e) { if (e instanceof RangeError) throw fail(400, 'invalid state'); throw e }
    next._rev = report.changed ? curRev + 2 : curRev + 1
    next._wids = [...(Array.isArray(cur?._wids) ? cur._wids : []), ...(cur?._wid ? [cur._wid] : [])]
      .filter(x => typeof x === 'string').slice(-WID_KEEP)
    next._wid = randomHex(8)
    const text = JSON.stringify(next)
    const r = await gh(cfg, `/repos/${cfg.repo}/contents/${FILE}`, {
      method: 'PUT',
      body: { message: 'Workout log sync', content: b64encode(text), branch: cfg.branch, ...(sha ? { sha } : {}) }
    })
    if (refused(r)) throw await denied(r)
    // Another device wrote between our read and this write (the blob sha moved): read again.
    // Without a baseRev the write is a deliberate replace, so it simply retries over the new copy.
    if (r.status === 409 || r.status === 422) {
      if (attempt < 2) continue
      throw fail(503, 'GitHub kept refusing the save. It will be retried.')
    }
    if (!r.ok) throw fail(r.status, 'GitHub answered ' + r.status + ' while saving.')
    const out = await r.json()
    head = { repo: cfg.repo, commit: out.commit?.sha || null, rev: next._rev, wid: next._wid }
    setNote('')
    return { ok: true, ts: next._ts || null, rev: curRev + 1, wid: next._wid }
  }
}

async function revNow(cfg) {
  const commit = await headCommit(cfg)
  if (head && head.repo === cfg.repo && commit && head.commit === commit) return { rev: head.rev, ...(head.wid ? { wid: head.wid } : {}) }
  const { doc } = await readDoc(cfg)
  head = { repo: cfg.repo, commit, rev: doc?._rev || 0, wid: doc?._wid || null }
  return { rev: head.rev, ...(head.wid ? { wid: head.wid } : {}) }
}

export const GH_USER = { id: 'github-sync', name: 'Me' }

// The routes of api/server.js this build answers itself. Everything else is "not here".
export async function ghRoute(path, init = {}) {
  const method = String(init.method || 'GET').toUpperCase()
  const route = method + ' ' + path.split('?')[0]
  const cfg = ghConfig()
  if (route === 'GET /api/config') return { invite_only: false, allow_guest: true }
  if (!cfg) {
    if (route === 'GET /api/me' || route.includes('/api/data')) throw fail(401, 'not signed in')
    throw fail(404, 'Not available in this build')
  }
  switch (route) {
    case 'GET /api/me': {
      const r = await gh(cfg, `/repos/${cfg.repo}`)
      if (refused(r) || r.status === 404) {
        if (r.status === 404) { setNote('This token cannot see ' + cfg.repo + '. Check the repository name and the token\'s repository access.'); throw fail(401, 'not signed in') }
        throw await denied(r)
      }
      if (!r.ok) throw fail(r.status, 'GitHub answered ' + r.status + '.')
      setNote('')
      return { user: { ...GH_USER, name: cfg.name || GH_USER.name } }
    }
    case 'GET /api/data': {
      const { doc } = await readDoc(cfg)
      return { state: forClient(doc), rev: doc?._rev || 0 }
    }
    case 'GET /api/data/rev': return revNow(cfg)
    case 'PUT /api/data': return putData(cfg, typeof init.body === 'string' ? JSON.parse(init.body) : init.body)
    case 'POST /api/logout':
    case 'POST /api/logout/all':
      ghDisconnect()
      head = null
      return { ok: true }
    default:
      throw fail(404, 'Not available with GitHub sync')
  }
}

// The connect screen: checks the token can read and write the repository, then keeps it.
export async function ghConnect({ repo, token, name }) {
  repo = String(repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '')
  token = String(token || '').trim()
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Enter the repository as owner/name, for example you/opengym-data.')
  if (!token) throw new Error('Paste the token from GitHub.')
  const cfg = { repo, token, branch: 'main', name: String(name || '').trim() }
  let r
  try { r = await gh(cfg, `/repos/${repo}`) } catch { throw new Error('Could not reach GitHub. Check your connection and try again.') }
  if (r.status === 401) throw new Error('GitHub did not accept that token. Copy it again, without spaces.')
  if (r.status === 404 || r.status === 403) throw new Error('That token cannot see ' + repo + '. Check the name, and that the token was given access to this repository.')
  if (!r.ok) throw new Error('GitHub answered ' + r.status + '. Try again in a minute.')
  const info = await r.json()
  if (info.permissions && info.permissions.push === false) throw new Error('That token can read ' + repo + ' but not write to it. Give it Contents: Read and write.')
  cfg.branch = info.default_branch || 'main'
  localStorage.setItem(KEY, JSON.stringify(cfg))
  setNote('')
  head = null
  return cfg
}
