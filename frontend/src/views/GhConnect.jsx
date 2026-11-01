// The way in for the GitHub Pages build (VITE_GH_SYNC=1): connect this device to the private
// repository that holds the profile (lib/gh-sync.js), or use it on this device only.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { ghConnect, ghNote, GH_DEFAULT_REPO } from '../lib/gh-sync.js'

export default function GhConnect() {
  const setGuest = useStore(s => s.setGuest)
  const [repo, setRepo] = useState(GH_DEFAULT_REPO)
  const [token, setToken] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(ghNote())
  const go = async e => {
    e.preventDefault()
    setBusy(true); setErr('')
    try { await ghConnect({ repo, token, name }); location.reload() }
    catch (x) { setErr(x.message || String(x)); setBusy(false) }
  }
  const wrap = { display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh' }
  return (
    <form className="narrow" style={wrap} onSubmit={go}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 54, display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}><Icon name="dumbbell" /></div>
        <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.028em', margin: '10px 0 4px' }}>openGym</h1>
        <div className="muted" style={{ marginBottom: 26 }}>Connect this device to your workout log on GitHub. Phone, laptop and TV then share one history.</div>
      </div>
      <label className="small muted" htmlFor="gh-repo">Data repository</label>
      <input id="gh-repo" className="input" value={repo} onChange={e => setRepo(e.target.value)} placeholder="you/opengym-data" autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{ marginTop: 6 }} />
      <div style={{ height: 14 }} />
      <label className="small muted" htmlFor="gh-token">GitHub token</label>
      <input id="gh-token" className="input" type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="github_pat_…" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{ marginTop: 6 }} />
      <div className="dim small" style={{ marginTop: 6 }}>Kept on this device only. It can read and write the data repository and nothing else.</div>
      <div style={{ height: 14 }} />
      <label className="small muted" htmlFor="gh-name">Your name (optional)</label>
      <input id="gh-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Pratik" style={{ marginTop: 6 }} />
      {err && <div className="card small" role="alert" style={{ marginTop: 16, color: 'var(--red, #d33)' }}>{err}</div>}
      <div style={{ height: 18 }} />
      <Button variant="primary" icon="cloud" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Connect and sync'}</Button>
      <div style={{ height: 8 }} />
      <Button variant="ghost" className="dim" type="button" onClick={() => setGuest(true)}>Use on this device only</Button>
    </form>
  )
}
