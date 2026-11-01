// The home screen of this fork: what today holds in Pratik's plan (lib/my-plan.js), morning and
// evening, with one tap to start each session in the openGym workout screen.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { todayISO, isoOf } from '../lib/format.js'
import { dateLocale } from '../lib/i18n.js'
import { exerciseNameFor } from '../lib/i18n.js'
import { exOr } from '../lib/exercises.js'
import { beginWorkout } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import './Today.css'
import { useConnectionTrouble } from '../components/SyncBanner.jsx'
import {
  R, dayPlan, routineNamed, missingRoutines, setsFor, applyWeekSets, applyRunMinutes,
  RUN_ZONE, STRIDES_NOTE, RUN_WARMUP, weekOf, SHORT
} from '../lib/my-plan.js'

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const nice = (iso, opts) => new Date(iso + 'T12:00:00').toLocaleDateString(dateLocale(), opts)

function doneOn(S, iso, routine) {
  if (!routine) return false
  return (S.workouts || []).some(w => w && w.d === iso && ((w.routineIds || []).includes(routine.id) || w.routineId === routine.id || w.name === routine.name))
}

function repsText(e) {
  if (e.min != null) return e.min + ' min'
  if (e.repsMin && e.reps && e.repsMin !== e.reps) return e.repsMin + '–' + e.reps
  return String(e.reps ?? '')
}

function ExerciseList({ routine, week }) {
  let letterOf = {}, n = 0
  for (const e of routine.ex) if (e.sg && !(e.sg in letterOf)) letterOf[e.sg] = String.fromCharCode(65 + n++)
  const seen = {}
  return <div className="mp-list">
    {routine.ex.map((e, i) => {
      const ex = exOr(e.id)
      let tag = ''
      if (e.sg) { seen[e.sg] = (seen[e.sg] || 0) + 1; tag = letterOf[e.sg] + seen[e.sg] }
      const sets = setsFor(e.sets || 1, week)
      return <div key={i} className="mp-row">
        <span className="mp-tag">{tag || i + 1}</span>
        <span className="grow mp-name">{SHORT[e.id] || exerciseNameFor(ex)}</span>
        <span className="mp-dose">{sets > 1 ? sets + ' × ' : ''}{repsText(e)}{e.weight ? ' · ' + e.weight + ' kg' : ''}</span>
      </div>
    })}
  </div>
}

export default function Today() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const update = useStore(s => s.update)
  const trouble = useConnectionTrouble()
  const today = todayISO()
  const [iso, setIso] = useState(today)
  const plan = dayPlan(iso)
  const isToday = iso === today
  const missing = missingRoutines(S.routines)
  const mobility = routineNamed(S.routines, R.mobility)
  const evening = plan.evening ? routineNamed(S.routines, plan.evening) : null
  const run = routineNamed(S.routines, R.run)
  const strengthWeek = plan.intro ? 1 : plan.week

  const start = (routine, after) => {
    if (!routine) return
    if (S.active) { nav('/workout'); return }
    beginWorkout([routine.id], null)
    update(s => { if (s.active) after?.(s.active) })
  }
  const hour = new Date().getHours()
  const eveningFirst = isToday && hour >= 12

  const setupCard = missing.length > 0 && <div className="card">
    <h2 style={{ marginTop: 0 }}>Set up your plan</h2>
    <div className="muted small" style={{ marginBottom: 12 }}>Adds the routines this screen runs: {missing.map(r => r.name).join(', ')}. You can edit them later in Plan.</div>
    <Button variant="primary" icon="clipboard" onClick={() => update(s => { s.routines.push(...missingRoutines(s.routines)); s.gifSize = 'full'; s.weighIn = false })}>Add my plan</Button>
  </div>

  const morning = <div className="card mp-card" key="am">
    <div className="mp-when">Morning</div>
    <div className="row between" style={{ gap: 10 }}>
      <div><h2 className="mp-title">Mobility</h2><div className="muted small">11 moves · about 15 min · posture and hips</div></div>
      {doneOn(S, iso, mobility) ? <span className="tag acc"><Icon name="check" /> Done</span>
        : isToday && mobility && <Button variant="primary" size="sm" icon="play" onClick={() => start(mobility)}>{S.active ? 'Resume' : 'Start'}</Button>}
    </div>
    {mobility && <details className="mp-more"><summary className="small muted">Show the moves</summary><ExerciseList routine={mobility} week={9} /></details>}
    {plan.run && <div className="mp-run">
      <div className="row between" style={{ gap: 10 }}>
        <div><div className="mp-sub">{plan.run.label} · {plan.run.min} min</div>
          <div className="muted small">{RUN_ZONE}</div>
          {plan.run.strides && <div className="muted small">{STRIDES_NOTE}</div>}
          <div className="dim small">Before: {RUN_WARMUP}</div></div>
        {doneOn(S, iso, run) ? <span className="tag acc"><Icon name="check" /> Done</span>
          : isToday && run && <Button size="sm" icon="figureRun" onClick={() => start(run, a => applyRunMinutes(a, plan.run.min))}>Run</Button>}
      </div>
    </div>}
  </div>

  const eveningCard = <div className="card mp-card" key="pm">
    <div className="mp-when">Evening · 4:30 PM</div>
    {plan.evening ? <>
      <div className="row between" style={{ gap: 10, marginBottom: 8 }}>
        <div><h2 className="mp-title">{plan.evening}</h2>
          <div className="muted small">{plan.intro ? 'First session: 2 sets each, stop 3 reps short of failure, find your working weights'
            : plan.deload ? 'Deload week: half the sets, same weights'
            : strengthWeek <= 1 ? 'Week 1: 2 sets per exercise' : plan.evening === R.core ? '3 rounds, 60 s rest between rounds' : 'Supersets: do 1 then 2, rest, repeat'}</div></div>
        {doneOn(S, iso, evening) ? <span className="tag acc"><Icon name="check" /> Done</span>
          : isToday && evening && <Button variant="primary" size="sm" icon="play" onClick={() => start(evening, a => applyWeekSets(a, strengthWeek))}>{S.active ? 'Resume' : 'Start'}</Button>}
      </div>
      {evening ? <ExerciseList routine={evening} week={strengthWeek} /> : <div className="dim small">Add your plan to see this session.</div>}
    </> : <>
      <h2 className="mp-title">Rest</h2>
      <div className="muted small">No strength session today. A walk is fine.</div>
    </>}
  </div>

  // Mon … Sun of the week the shown day is in, with a dot per session done.
  const wd = (new Date(iso + 'T12:00:00').getDay() + 6) % 7
  const monday = addDays(iso, -wd)
  const strip = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i)
    const p = dayPlan(d)
    const ev = p.evening ? routineNamed(S.routines, p.evening) : null
    const dots = d < '2026-11-01' ? [] : [doneOn(S, d, mobility), ...(p.run ? [doneOn(S, d, run)] : []), ...(p.evening ? [doneOn(S, d, ev)] : [])]
    return <button key={d} className={'mp-day' + (d === iso ? ' on' : '') + (d === today ? ' now' : '')} onClick={() => setIso(d)}>
      <span className="small dim">{nice(d, { weekday: 'narrow' })}</span>
      <span className="mp-daynum">{+d.slice(8)}</span>
      <span className="mp-dots">{dots.map((x, k) => <i key={k} className={x ? 'on' : ''} />)}</span>
    </button>
  })

  const wk = plan.intro ? 'First session' : plan.week ? 'Week ' + plan.week + (plan.deload ? ' · deload' : '') : 'Before the plan starts'

  return <div className="narrow mp-today">
    <div className="hdr">
      <div>
        <h1>{isToday ? (user?.name && user.name !== 'Me' ? 'Hi ' + user.name : 'Today') : nice(iso, { weekday: 'long' })}</h1>
        <div className="sub">{nice(iso, { weekday: 'long', day: 'numeric', month: 'long' })} · {wk}</div>
      </div>
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label="Settings"><Icon name="gear" />{trouble && <span className="tab-dot" aria-hidden="true" />}</button>
    </div>
    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setIso(addDays(iso, -7))} aria-label="Previous week"><Icon name="chevronLeft" /></button>
        <div className="small muted" style={{ fontWeight: 500 }}>Week of {nice(monday, { day: 'numeric', month: 'short' })}{weekOf(monday) ? ' · week ' + weekOf(monday) : ''}</div>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setIso(addDays(iso, 7))} aria-label="Next week"><Icon name="chevronRight" /></button>
      </div>
      <div className="mp-strip">{strip}</div>
      {!isToday && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}><Button size="sm" variant="ghost" onClick={() => setIso(today)}>Back to today</Button></div>}
    </div>
    {setupCard}
    {eveningFirst ? [eveningCard, morning] : [morning, eveningCard]}
  </div>
}
