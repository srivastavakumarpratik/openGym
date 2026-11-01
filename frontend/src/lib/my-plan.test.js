import { describe, it, expect } from 'vitest'
import { weekOf, isDeload, setsFor, runOn, dayPlan, applyWeekSets, missingRoutines, PLAN_ROUTINES } from './my-plan.js'

describe('my plan', () => {
  it('numbers the weeks from Monday 2 November 2026', () => {
    expect(weekOf('2026-11-01')).toBe(0)
    expect(weekOf('2026-11-02')).toBe(1)
    expect(weekOf('2026-11-08')).toBe(1)
    expect(weekOf('2026-11-09')).toBe(2)
    expect(weekOf('2026-11-23')).toBe(4)
    expect(isDeload(4)).toBe(true)
    expect(isDeload(8)).toBe(true)
    expect(isDeload(5)).toBe(false)
  })
  it('caps sets at 2 in week 1 and halves them on a deload', () => {
    expect(setsFor(4, 1)).toBe(2)
    expect(setsFor(3, 2)).toBe(3)
    expect(setsFor(4, 4)).toBe(2)
    expect(setsFor(3, 4)).toBe(2)
    expect(setsFor(2, 8)).toBe(1)
  })
  it('plans the runs on Monday, Wednesday and Saturday', () => {
    expect(runOn('2026-11-02')).toMatchObject({ min: 25, long: false })
    expect(runOn('2026-11-07')).toMatchObject({ min: 35, long: true })
    expect(runOn('2026-11-18')).toMatchObject({ min: 30, strides: true })
    expect(runOn('2026-11-03')).toBeNull()
    expect(runOn('2026-12-12')).toMatchObject({ min: 55, long: true })
    expect(runOn('2026-12-19')).toMatchObject({ min: 55 })
  })
  it('puts Upper on the first evening and keeps weekends free', () => {
    expect(dayPlan('2026-11-01').evening).toBe('Upper')
    expect(dayPlan('2026-11-02').evening).toBe('Lower')
    expect(dayPlan('2026-11-04').evening).toBe('Core')
    expect(dayPlan('2026-11-07').evening).toBeNull()
    expect(dayPlan('2026-11-08').evening).toBeNull()
  })
  it('trims a session to the week, keeping warm-ups', () => {
    const active = { entries: [
      { target: { sets: 4 }, sets: [{ phase: 'warmup' }, {}, {}, {}, {}] },
      { target: { mode: 'cardio', min: 25 }, sets: [{ min: 25 }] },
    ] }
    applyWeekSets(active, 1)
    expect(active.entries[0].sets.length).toBe(3)
    expect(active.entries[0].target.sets).toBe(2)
    expect(active.entries[1].sets.length).toBe(1)
  })
  it('adds only the routines that are missing', () => {
    expect(missingRoutines([]).length).toBe(PLAN_ROUTINES.length)
    expect(missingRoutines([{ name: 'Upper' }]).map(r => r.name)).not.toContain('Upper')
  })
})
