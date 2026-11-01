// Pratik's home plan (this fork only): 3 runs a week, mobility every morning, and evening strength
// with one adjustable dumbbell (2.5 to 24 kg), body weight and a pull-up bar. Week 1 starts on
// Monday 2 November 2026; Sunday 1 November is the first session (Upper, 2 sets per exercise).
//
// Routines are found by name, so they stay ordinary openGym routines that sync, edit and log like
// any other. Pure helpers only: the Today screen (views/Today.jsx) reads them.
import { uid } from './format.js'
import { isWarmupRow } from './workout-model.js'

export const START = '2026-11-02'

// Short names for the Today screen; the workout screen keeps the catalogue's names.
export const SHORT = {
  '4580': 'Cat–cow', '3149': 'Chin tucks', '4601': 'Open book', '2941': 'Wall slides', '0688': 'Scapular pull-ups',
  '4633': 'World’s greatest stretch', '4555': '90/90 hip switches', '1053': 'Half-kneeling hip flexor stretch',
  '2936': 'Knee-to-wall ankle rocks', '1686': 'Deep squat with reach', '3013': 'Glute bridge',
  '0652': 'Pull-up', '0662': 'Push-up', '0292': 'One-arm dumbbell row', '11016': 'Half-kneeling dumbbell press',
  '0359': 'One-arm reverse fly', '9819': 'Hanging knee raise', '1760': 'Goblet squat', '1459': 'Dumbbell RDL',
  '7549': 'Rear-foot-elevated split squat', '5052': 'Single-leg calf raise', '4791': 'Single-leg glute bridge',
  '0276': 'Dead bug', '1241': 'Bird dog', '4133': 'Suitcase deadlift (dumbbell)', '0685': 'Run',
}
export const INTRO_DAY = '2026-11-01'

export const R = {
  mobility: 'Morning mobility',
  upper: 'Upper',
  lower: 'Lower',
  core: 'Core',
  run: 'Run',
}

const dayNum = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000)
const weekdayOf = iso => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay()

/** Training week of a date: 0 before Monday 2 November 2026, then 1, 2, 3 … */
export const weekOf = iso => {
  const d = dayNum(iso) - dayNum(START)
  return d < 0 ? 0 : Math.floor(d / 7) + 1
}
export const isDeload = week => week > 0 && week % 4 === 0

/** Working sets for an exercise the plan writes as `base` sets: 2 in week 1, half on a deload. */
export const setsFor = (base, week) => {
  if (week <= 1) return Math.min(base, 2)
  if (isDeload(week)) return Math.max(1, Math.ceil(base / 2))
  return base
}

// Run minutes per week: [Mon easy, Wed easy, Sat long]. After week 6 the week-6 numbers hold
// until a race build replaces them.
const RUNS = { 1: [25, 25, 35], 2: [25, 30, 40], 3: [30, 30, 45], 4: [25, 25, 35], 5: [30, 35, 50], 6: [30, 35, 55] }
const STRIDES = new Set([3, 5, 6])

/** The run planned on a date, or null. */
export function runOn(iso) {
  const week = weekOf(iso)
  if (week < 1) return null
  const slot = { 1: 0, 3: 1, 6: 2 }[weekdayOf(iso)]
  if (slot == null) return null
  const w = Math.min(week, 6)
  const min = RUNS[w][slot]
  const label = slot === 2 ? 'Long run' : slot === 0 ? 'Easy run' : 'Easy run'
  return { min, label, strides: slot === 1 && (STRIDES.has(w) || week > 6), long: slot === 2 }
}

/** What a date holds: the morning (mobility, maybe a run) and the evening routine name or null. */
export function dayPlan(iso) {
  const wd = weekdayOf(iso)
  const evening = iso === INTRO_DAY ? R.upper : { 1: R.lower, 2: R.upper, 3: R.core, 4: R.lower, 5: R.upper }[wd] || null
  const week = weekOf(iso)
  return { iso, week, deload: isDeload(week), intro: iso === INTRO_DAY, run: runOn(iso), evening }
}

export const RUN_ZONE = 'Zone 2: heart rate 140–151 bpm. Above 151, walk until it drops to about 140, then run again.'
export const STRIDES_NOTE = 'Finish with 4–6 strides: 20 s relaxed-fast, walk back to recover.'
export const RUN_WARMUP = '10 leg swings per side and 2 min brisk walking, then start.'

// [catalogue id, sets, reps or [min, max], extra]  extra: { w, sg, sgRest, rest, note, prog }
const ex = (id, sets, reps, extra = {}) => {
  const o = { id, sets, weight: extra.w ?? 0 }
  if (Array.isArray(reps)) { o.repsMin = reps[0]; o.reps = reps[1] } else o.reps = reps
  if (extra.sg) { o.sg = extra.sg; if (extra.sgRest) o.sgRest = extra.sgRest }
  if (extra.rest != null) { if (extra.rest > 0) o.restSec = extra.rest; else o.restOff = true }
  if (extra.note) o.note = extra.note
  if (extra.prog) o.prog = extra.prog
  return o
}

const MOBILITY = [
  ex('4580', 1, 10, { rest: 0, note: '10 slow reps' }),
  ex('3149', 1, 10, { rest: 0, note: 'Back against a wall. 10 reps, 2-breath hold each' }),
  ex('4601', 1, 8, { rest: 0, note: '8 per side' }),
  ex('2941', 1, 10, { rest: 0, note: 'Back, head and forearms on the wall' }),
  ex('0688', 2, 8, { rest: 0, note: 'On the bar, straight arms, pull the shoulder blades down' }),
  ex('4633', 1, 5, { rest: 0, note: '5 per side' }),
  ex('4555', 1, 8, { rest: 0, note: '8 per side' }),
  ex('1053', 1, 5, { rest: 0, note: '5 slow breaths per side, back glute squeezed' }),
  ex('2936', 1, 10, { rest: 0, note: 'Knee to wall, heel down. 10 per side' }),
  ex('1686', 1, 5, { rest: 0, note: 'Sit in a deep squat, reach one arm up and rotate. 5 per side' }),
  ex('3013', 1, 12, { rest: 0, note: '12 reps' }),
]

const UPPER = [
  ex('0652', 4, [3, 8], { sg: 'a', sgRest: 75, note: 'Each set: your max minus 1. Under 3 reps: do 3 negatives, 5 s down' }),
  ex('0662', 4, [8, 15], { sg: 'a', note: 'Body in one line. Too easy: feet on a chair' }),
  ex('0292', 3, [10, 12], { w: 12, sg: 'b', sgRest: 75, note: 'Per side. Hand and knee on the bed or a chair, pull the elbow to the hip' }),
  ex('11016', 3, [8, 10], { w: 7.5, sg: 'b', note: 'Per side. Ribs down, no back arch' }),
  ex('0359', 2, [12, 15], { w: 2.5, sg: 'c', sgRest: 60, note: 'Per side. Squeeze the shoulder blade back' }),
  ex('9819', 3, [8, 12], { sg: 'c', note: 'No swinging, knees to hip height' }),
]

const LOWER = [
  ex('1760', 3, [8, 12], { w: 12, rest: 90, note: 'Heels down, 3 s on the way down' }),
  ex('1459', 3, [10, 12], { w: 16, rest: 90, note: 'One dumbbell held vertically in both hands. Hips back, flat back, soft knees' }),
  ex('7549', 3, [8, 10], { w: 6, rest: 60, note: 'Per side. Rear foot on a chair or the bed, front knee over the toes' }),
  ex('5052', 3, [12, 15], { rest: 60, note: 'Per side. On a step, full range, 1 s pause at the top. Dumbbell (0–10 kg) in the same-side hand' }),
  ex('4791', 2, 12, { rest: 60, note: 'Per side. Hips level, push through the heel' }),
]

const CORE = [
  ex('9819', 3, 10, { sg: 'k', sgRest: 60, prog: 'off', note: 'Circuit: 3 rounds, 60 s rest between rounds' }),
  ex('0276', 3, 8, { sg: 'k', prog: 'off', note: '8 per side, low back pressed to the floor' }),
  ex('1241', 3, 8, { sg: 'k', prog: 'off', note: '8 per side, 2-breath hold at full reach' }),
  ex('4133', 3, 10, { w: 16, sg: 'k', note: 'Per side, with your dumbbell. Torso stays upright' }),
  ex('4633', 1, 5, { rest: 0, prog: 'off', note: 'Cool-down: 5 per side' }),
  ex('4555', 1, 8, { rest: 0, prog: 'off', note: 'Cool-down: 8 per side' }),
  ex('1053', 1, 5, { rest: 0, prog: 'off', note: 'Cool-down: 5 breaths per side' }),
  ex('2936', 1, 10, { rest: 0, prog: 'off', note: 'Cool-down: 10 per side' }),
]

const RUN = [{ id: '0685', sets: 1, mode: 'cardio', min: 25, note: 'Zone 2: 140–151 bpm. Walk when you pass 151' }]

export const PLAN_ROUTINES = [
  { name: R.mobility, emoji: 'figureStrength', ex: MOBILITY, excludeFromProgression: true },
  { name: R.upper, emoji: 'barbell', ex: UPPER, prog: 'double' },
  { name: R.lower, emoji: 'legs', ex: LOWER, prog: 'double' },
  { name: R.core, emoji: 'figureStrength', ex: CORE, prog: 'off' },
  { name: R.run, emoji: 'figureRun', ex: RUN, excludeFromProgression: true },
]

/** Fresh copies of the plan's routines that are missing from `routines` (matched by name). */
export function missingRoutines(routines) {
  const have = new Set((routines || []).map(r => r.name))
  return PLAN_ROUTINES.filter(r => !have.has(r.name)).map(r => ({ ...JSON.parse(JSON.stringify(r)), id: uid() }))
}

export const routineNamed = (routines, name) => (routines || []).find(r => r.name === name) || null

/** Trims a just-started session to the week's sets (week 1: 2, deload: half). Mutates `active`. */
export function applyWeekSets(active, week) {
  if (!active || !Array.isArray(active.entries)) return
  for (const e of active.entries) {
    if (!Array.isArray(e.sets) || e.target?.mode === 'cardio' || e.target?.min != null) continue
    const base = e.target?.sets || e.sets.filter(s => !isWarmupRow(s)).length
    const keep = setsFor(base, week)
    let working = 0
    e.sets = e.sets.filter(s => isWarmupRow(s) ? true : ++working <= keep)
    if (e.target) e.target.sets = keep
  }
}

/** Sets the run's minutes on a just-started run session. Mutates `active`. */
export function applyRunMinutes(active, min) {
  if (!active || !Array.isArray(active.entries)) return
  for (const e of active.entries) {
    if (e.target) e.target.min = min
    if (Array.isArray(e.sets)) for (const s of e.sets) if (s && 'min' in s) s.min = min
  }
}
