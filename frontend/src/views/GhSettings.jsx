// Settings for this fork: the GitHub sync of this device, units and theme. Everything else
// openGym offers is left out on purpose.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { ghConfig } from '../lib/gh-sync.js'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'

const STATUS = {
  ok: 'In sync with GitHub',
  pending: 'Changes waiting to sync',
  offline: 'Offline. Changes are kept here and sync when you are back online.',
  error: 'GitHub answered with an error. Try Sync now.',
  auth: 'GitHub refused the token. Disconnect and connect again with a new one.',
  held: 'Waiting for your answer about this device’s data',
  local: 'Not synced. This device only.',
}

export default function GhSettings() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const sync = useStore(s => s.sync)
  const user = useStore(s => s.user)
  const update = useStore(s => s.update)
  const setUnit = useStore(s => s.setUnit)
  const syncNow = useStore(s => s.syncNow)
  const signOut = useStore(s => s.signOut)
  const setGuest = useStore(s => s.setGuest)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const cfg = ghConfig()
  const last = sync?.lastSynced ? new Date(sync.lastSynced).toLocaleString() : 'never'

  const doSync = async () => { setBusy('sync'); setNote(''); try { await syncNow() } finally { setBusy('') } }
  const disconnect = async () => {
    setBusy('out')
    const r = await signOut({ force: false })
    setBusy('')
    if (r?.owed) setNote('This device has changes that have not reached GitHub yet. Sync first, or they stay only here.')
  }

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label="Back"><Icon name="chevronLeft" /></button>
      <div className="grow"><h1>Settings</h1></div>
    </div>

    <div className="card">
      <h2 style={{ marginTop: 0 }}>Sync</h2>
      {user && cfg ? <>
        <div className="small muted">Saving to <b>{cfg.repo}</b> on GitHub</div>
        <div style={{ marginTop: 8 }}>{STATUS[sync?.status] || STATUS.ok}</div>
        <div className="dim small" style={{ marginTop: 2 }}>Last synced: {last}</div>
        {note && <div className="small" role="alert" style={{ marginTop: 8, color: 'var(--orange)' }}>{note}</div>}
        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Button size="sm" variant="tinted" icon="cloud" disabled={!!busy} onClick={doSync}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</Button>
          <Button size="sm" variant="ghost" className="dim" disabled={!!busy} onClick={disconnect}>Disconnect this device</Button>
        </div>
      </> : <>
        <div className="small muted">This device is not connected. Workouts logged here stay on this device.</div>
        <div style={{ marginTop: 12 }}><Button size="sm" variant="tinted" icon="cloud" onClick={() => setGuest(false)}>Connect to GitHub</Button></div>
      </>}
    </div>

    <div className="card">
      <h2 style={{ marginTop: 0 }}>Units</h2>
      <Segmented value={S.unit} onChange={v => setUnit(v)} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
    </div>

    <div className="card">
      <h2 style={{ marginTop: 0 }}>Theme</h2>
      <Segmented value={S.theme || 'dark'} onChange={v => update(s => { s.theme = v })}
        options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
    </div>

    <div className="dim small" style={{ padding: '4px 4px 24px', lineHeight: 1.6 }}>
      Built on openGym (AGPL-3.0). Exercise images and animations © Gym visual, gymvisual.com.
    </div>
  </div>
}
