import { describe, it, expect } from 'vitest'
import { parseUtterance, numbersIn, nextCount } from './voice-commands.js'

describe('voice commands', () => {
  it('reads counts in digits, words and run-together digits', () => {
    expect(numbersIn('1 2 3 4')).toEqual([1, 2, 3, 4])
    expect(numbersIn('one two three')).toEqual([1, 2, 3])
    expect(numbersIn('1234')).toEqual([4])
    expect(numbersIn('twenty one')).toEqual([21])
    expect(numbersIn('12')).toEqual([12])
  })
  it('counts up only by steps a person could make', () => {
    expect(nextCount(0, [1, 2, 3, 4, 5])).toBe(5)
    expect(nextCount(5, [40])).toBe(5)
    expect(nextCount(5, [6, 7, 8])).toBe(8)
    expect(nextCount(0, [12])).toBe(0)
  })
  it('understands the commands', () => {
    expect(parseUtterance('done')).toEqual({ command: 'done' })
    expect(parseUtterance('done 8')).toEqual({ command: 'done', reps: 8 })
    expect(parseUtterance('I did 12')).toEqual({ command: 'done', reps: 12 })
    expect(parseUtterance('10 reps')).toEqual({ command: 'done', reps: 10 })
    expect(parseUtterance('pause').command).toBe('pause')
    expect(parseUtterance('resume').command).toBe('resume')
    expect(parseUtterance('play').command).toBe('resume')
    expect(parseUtterance('skip rest').command).toBe('skip')
    expect(parseUtterance('add 15 seconds')).toEqual({ command: 'add', value: 15 })
    expect(parseUtterance('more time')).toEqual({ command: 'add', value: 15 })
    expect(parseUtterance('weight 14 kg')).toEqual({ command: 'weight', value: 14 })
    expect(parseUtterance('weight 7.5')).toEqual({ command: 'weight', value: 7.5 })
    expect(parseUtterance('finish workout').command).toBe('finish')
    expect(parseUtterance('close').command).toBe('exit')
    expect(parseUtterance('repeat that').command).toBe('repeat')
    expect(parseUtterance('5 6 7').command).toBe(null)
  })
})
