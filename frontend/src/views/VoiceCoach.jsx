// Voice coach (this fork): one exercise at a time, full screen, for a TV you cast to. It listens
// on the device running the page: you count your reps out loud, say "done", and it logs the set
// through the workout screen's own actions (the ones the Apple Watch uses), so rest timers,
// supersets and sync behave exactly as if you had tapped. It talks back: the rest, the 10-second
// warning, and what comes next.
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { exerciseNameFor } from '../lib/i18n.js'
import { modeOf } from '../lib/history.js'
import { isWarmupRow } from '../lib/workout-model.js'
import { boundWatchActions } from '../lib/watch-sync.js'
import { parseUtterance, numbersIn, nextCount } from '../lib/voice-commands.js'
import { SHORT } from '../lib/my-plan.js'
import Media from '../components/Media.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import './VoiceCoach.css'

const Rec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
export const voiceSupported = () => !!Rec

const nameOf = e => SHORT[e.id] || exerciseNameFor(exOr(e.id))

// The set to do next: from the marker on, the first exercise with a set not done.
function targetOf(A) {
  if (!A?.entries?.length) return null
  const n = A.entries.length
  const from = Math.min(Math.max(A.cur || 0, 0), n - 1)
  for (let k = 0; k < n; k++) {
    const idx = (from + k) % n
    const e = A.entries[idx]
    const i = (e.sets || []).findIndex(s => !s.done)
    if (i < 0) continue
    const working = e.sets.filter(s => !isWarmupRow(s))
    const warm = isWarmupRow(e.sets[i])
    const setNo = warm ? 0 : e.sets.slice(0, i + 1).filter(s => !isWarmupRow(s)).length
    const t = e.target || {}
    const range = t.repsMin && t.reps && t.repsMin !== t.reps ? t.repsMin + ' to ' + t.reps : null
    return { idx, i, e, row: e.sets[i], warm, setNo, total: working.length, range, mode: modeOf(t), name: nameOf(e) }
  }
  return null
}

const say = (t, w) => {
  const reps = t.row?.r || t.e.target?.reps
  const what = t.mode === 'reps' ? (t.range ? t.range + ' reps' : reps ? reps + ' reps' : '') : ''
  const wt = t.row?.w > 0 ? ', ' + t.row.w + ' kilos' : ''
  return (w ? w + ' ' : '') + t.name + (t.warm ? ', warm-up set' : t.total > 1 ? ', set ' + t.setNo + ' of ' + t.total : '') + (what ? '. ' + what : '') + wt + '.'
}

function pickVoice() {
  try {
    const vs = window.speechSynthesis.getVoices()
    return vs.find(v => /en-IN/i.test(v.lang)) || vs.find(v => /en-GB/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null
  } catch { return null }
}

export default function VoiceCoach({ onClose }) {
  const A = useStore(s => s.S.active)
  const update = useStore(s => s.update)
  const timer = useUI(s => s.timer)
  const [count, setCount] = useState(0)
  const [heard, setHeard] = useState('')
  const [listening, setListening] = useState(false)
  const [micError, setMicError] = useState('')
  const [paused, setPaused] = useState(false)
  const t = targetOf(A)
  const resting = !!(timer && !timer.ready)
  const left = timer && !timer.ready ? Math.max(0, timer.paused ? timer.left : Math.ceil((timer.endsAt - Date.now()) / 1000)) : 0

  // Refs for the recognition callbacks, which outlive renders.
  const st = useRef({})
  st.current = { t, count, resting, paused, timer }
  const speakingUntil = useRef(0)
  const alive = useRef(true)
  const warned = useRef(null)
  const wasResting = useRef(false)

  const speak = text => {
    try {
      const s = window.speechSynthesis
      s.cancel()
      const u = new SpeechSynthesisUtterance(text)
      const v = pickVoice(); if (v) u.voice = v
      u.rate = 1.02
      speakingUntil.current = Date.now() + 60000
      u.onend = () => { speakingUntil.current = Date.now() + 500 }
      u.onerror = () => { speakingUntil.current = 0 }
      s.speak(u)
    } catch { speakingUntil.current = 0 }
  }

  const announceNext = (prefix) => {
    const fresh = targetOf(useStore.getState().S.active)
    const tm = useUI.getState().timer
    if (!fresh) { speak('That was the last set. Workout complete. Well done.'); return }
    if (tm && !tm.ready) speak((prefix ? prefix + ' ' : '') + 'Rest ' + Math.round(tm.left || tm.total) + ' seconds. Next: ' + say(fresh))
    else speak(say(fresh, prefix || 'Next:'))
  }

  const complete = repsSaid => {
    const cur = st.current.t
    const acts = boundWatchActions()
    if (!cur || !acts) return
    if (cur.mode !== 'reps') { acts.setDone(cur.idx, cur.i, { at: Date.now() }) }
    else {
      const reps = repsSaid ?? (st.current.count > 0 ? st.current.count : (cur.row.r || cur.e.target?.reps || 0))
      acts.setDone(cur.idx, cur.i, { r: reps, w: cur.row.w ?? 0, at: Date.now() })
    }
    setCount(0); setHeard('')
    warned.current = null
    setTimeout(() => announceNext(), 250)
  }

  const skip = () => {
    const ui = useUI.getState()
    if (st.current.resting) { ui.stopRest(); return }
    const cur = st.current.t
    if (!cur) return
    const n = useStore.getState().S.active.entries.length
    update(s => { if (s.active) s.active.cur = (cur.idx + 1) % n })
    setCount(0)
    setTimeout(() => announceNext('Skipped.'), 150)
  }

  const handle = (text, final) => {
    if (Date.now() < speakingUntil.current) return
    setHeard(text)
    const p = parseUtterance(text)
    const s = st.current
    if (!final) {
      // Counting shows up live, before the phrase is final.
      if (!s.resting && !s.paused && s.t?.mode === 'reps') setCount(c => nextCount(c, numbersIn(text)))
      return
    }
    const ui = useUI.getState()
    switch (p.command) {
      case 'done': if (!s.resting) complete(p.reps); break
      case 'pause': if (s.resting) ui.pauseRest(); setPaused(true); speak('Paused.'); break
      case 'resume':
        setPaused(false)
        if (s.timer?.paused) { ui.resumeRest(); speak('Resuming.') }
        else if (!s.resting && s.t) speak(say(s.t, 'Go.'))
        break
      case 'skip': skip(); break
      case 'repeat': if (s.t) speak(s.resting ? 'Resting. Next: ' + say(s.t) : say(s.t)); break
      case 'reset': setCount(0); speak('Count reset.'); break
      case 'add': if (s.resting) { ui.addRest(p.value); speak('Added ' + p.value + ' seconds.') } break
      case 'weight':
        if (s.t && p.value >= 0 && p.value <= 300) {
          update(st2 => { const row = st2.active?.entries?.[s.t.idx]?.sets?.[s.t.i]; if (row) row.w = p.value })
          speak('Weight ' + p.value + ' kilos.')
        }
        break
      case 'finish': { const acts = boundWatchActions(); speak('Finishing the workout.'); onClose(); acts?.finish(); break }
      case 'exit': speak('Voice coach off.'); onClose(); break
      default:
        if (!s.resting && !s.paused && s.t?.mode === 'reps') setCount(c => nextCount(c, numbersIn(text)))
    }
  }

  // The microphone: continuous, restarted whenever the browser ends it.
  useEffect(() => {
    alive.current = true
    if (!Rec) { setMicError('This browser cannot listen. Use Chrome on your laptop or an Android phone; the buttons below still work.'); return }
    let rec = null
    const begin = () => {
      if (!alive.current) return
      rec = new Rec()
      rec.lang = 'en-IN'
      rec.continuous = true
      rec.interimResults = true
      rec.onstart = () => { setListening(true); setMicError('') }
      rec.onresult = ev => {
        for (let k = ev.resultIndex; k < ev.results.length; k++) {
          const r = ev.results[k]
          handle(r[0].transcript, r.isFinal)
        }
      }
      rec.onerror = ev => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { alive.current = false; setMicError('Microphone access was refused. Allow the microphone for this site in the browser, then reopen the voice coach.') }
        else if (ev.error === 'network') setMicError('Speech recognition needs an internet connection.')
      }
      rec.onend = () => { setListening(false); if (alive.current) setTimeout(begin, 300) }
      try { rec.start() } catch { setTimeout(begin, 1000) }
    }
    begin()
    return () => { alive.current = false; try { rec && rec.abort() } catch { /* already stopped */ } }
  }, [])

  // Keep the screen on while the coach runs (laptop or phone casting to the TV).
  useEffect(() => {
    let lock = null
    const take = async () => { try { lock = await navigator.wakeLock?.request('screen') } catch { /* not granted */ } }
    take()
    const again = () => { if (document.visibilityState === 'visible') take() }
    document.addEventListener('visibilitychange', again)
    return () => { document.removeEventListener('visibilitychange', again); try { lock?.release() } catch { /* gone */ } }
  }, [])

  // First words, and a goodbye of the speech queue on close.
  useEffect(() => {
    const first = targetOf(useStore.getState().S.active)
    speak(first ? 'Voice coach on. Count your reps out loud and say done. ' + say(first, 'First:') : 'Nothing left to do in this workout.')
    return () => { try { window.speechSynthesis.cancel() } catch { /* nothing to cancel */ } }
  }, [])

  // Rest: a warning at 10 seconds, then "go" with what comes next.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!resting) {
      if (wasResting.current) { wasResting.current = false; const nx = targetOf(useStore.getState().S.active); if (nx) speak(say(nx, 'Go.')) }
      return
    }
    wasResting.current = true
    const id = setInterval(() => {
      setTick(x => x + 1)
      const tm = useUI.getState().timer
      if (!tm || tm.ready || tm.paused) return
      const l = Math.ceil((tm.endsAt - Date.now()) / 1000)
      if (l === 10 && warned.current !== tm.endsAt && tm.total > 15) { warned.current = tm.endsAt; speak('10 seconds.') }
    }, 250)
    return () => clearInterval(id)
  }, [resting])

  const ex = t ? exOr(t.e.id) : null
  const mm = String(Math.floor(left / 60)), ss = String(left % 60).padStart(2, '0')
  const done = !t

  return <div className="vc" role="dialog" aria-label="Voice coach">
    <div className="vc-top">
      <span className={'vc-mic' + (listening ? ' on' : '')}><Icon name="mic" /> {micError ? 'Mic off' : listening ? 'Listening' : 'Starting the mic…'}</span>
      <span className="vc-heard" aria-live="polite">{heard ? '“' + heard + '”' : 'Say: 1, 2, 3 … then “done”'}</span>
      <button className="iconbtn" onClick={onClose} aria-label="Close the voice coach"><Icon name="xmark" /></button>
    </div>
    {micError && <div className="vc-err" role="alert">{micError}</div>}
    {done ? <div className="vc-main vc-end">
      <h1>Workout complete</h1>
      <p className="muted">Close the coach to save it.</p>
      <Button variant="primary" onClick={onClose}>Close</Button>
    </div> : <div className="vc-main">
      <div className="vc-media">{ex && <Media ex={ex} key={t.e.id} />}</div>
      <div className="vc-side">
        <div className="vc-set">{t.warm ? 'Warm-up' : t.total > 1 ? 'Set ' + t.setNo + ' of ' + t.total : 'One set'}</div>
        <h1 className="vc-name">{t.name}</h1>
        <div className="vc-dose">{t.mode === 'reps' ? (t.range || t.row.r || t.e.target?.reps) + ' reps' : t.mode === 'time' ? (t.row.sec || t.e.target?.sec) + ' s' : 'Cardio'}{t.row.w > 0 ? ' · ' + t.row.w + ' kg' : ''}</div>
        {t.e.target?.note && <div className="vc-note">{t.e.target.note}</div>}
        {resting ? <div className="vc-rest">
          <div className="vc-rest-lbl">{timer.paused ? 'Rest paused' : 'Rest'}</div>
          <div className="vc-big">{mm}:{ss}</div>
          <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
            <Button size="sm" onClick={() => useUI.getState().addRest(15)}>+15 s</Button>
            <Button size="sm" onClick={() => (timer.paused ? useUI.getState().resumeRest() : useUI.getState().pauseRest())}>{timer.paused ? 'Resume' : 'Pause'}</Button>
            <Button size="sm" onClick={() => useUI.getState().stopRest()}>Skip rest</Button>
          </div>
        </div> : <div className="vc-count">
          <div className="vc-rest-lbl">{paused ? 'Paused' : 'Reps'}</div>
          <div className="vc-big">{count}</div>
          <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
            <Button size="sm" onClick={() => setCount(c => Math.max(0, c - 1))}>−1</Button>
            <Button size="sm" onClick={() => setCount(c => c + 1)}>+1</Button>
            <Button size="sm" onClick={skip}>Skip</Button>
          </div>
          <Button variant="primary" icon="check" onClick={() => complete()} style={{ marginTop: 12 }}>Done{count ? ' · ' + count + ' reps' : ''}</Button>
        </div>}
        <div className="vc-help dim small">Say “done”, “done 8”, “pause”, “resume”, “skip”, “repeat”, “add 15 seconds”, “weight 14”, “finish workout” or “close”.</div>
      </div>
    </div>}
  </div>
}
