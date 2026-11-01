// What the voice coach (views/VoiceCoach.jsx) makes of one thing you said: a rep count you are
// calling out, and/or a command. Pure, so it can be tested without a microphone.

const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90,
}

// "1234" is how a recogniser often writes "one two three four" said quickly: a run of
// consecutive digits counts as the last one.
function digitRun(tok) {
  if (tok.length < 2) return null
  for (let k = 1; k < tok.length; k++) if (+tok[k] !== +tok[k - 1] + 1) return null
  return +tok[tok.length - 1]
}

/** Every number in `text`, in order (digits and number words, "twenty one" as 21). */
export function numbersIn(text) {
  const out = []
  const toks = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  for (let k = 0; k < toks.length; k++) {
    const tok = toks[k]
    if (/^\d+$/.test(tok)) {
      const run = digitRun(tok)
      if (run != null && +tok > 60) out.push(run)
      else out.push(+tok)
      continue
    }
    if (tok in WORDS) {
      let v = WORDS[tok]
      if (v >= 20 && toks[k + 1] in WORDS && WORDS[toks[k + 1]] < 10) { v += WORDS[toks[k + 1]]; k++ }
      out.push(v)
    }
  }
  return out
}

const has = (text, re) => re.test(text)

/**
 * { command, value, reps } for one utterance. `reps` is set when the count is said with the
 * command ("done 8", "8 reps", "I did 12"). `command` is one of: finish, exit, done, pause,
 * resume, skip, repeat, reset, add, weight, or null when it was only counting.
 */
export function parseUtterance(raw) {
  const text = ' ' + String(raw || '').toLowerCase().replace(/[^a-z0-9.\s']/g, ' ').replace(/\s+/g, ' ').trim() + ' '
  const nums = numbersIn(text)
  const last = nums.length ? nums[nums.length - 1] : null
  if (has(text, /\b(finish|end|stop) (the )?workout\b/)) return { command: 'finish' }
  if (has(text, /\b(exit|close|stop listening|turn off)\b/)) return { command: 'exit' }
  if (has(text, /\b(weight|kilo|kilos|kg|kgs)\b/) && last != null) {
    const dec = text.match(/(\d+(?:\.\d+)?)\s*(kilo|kg|kilos|kgs)?/)
    return { command: 'weight', value: dec ? parseFloat(dec[1]) : last }
  }
  if (has(text, /\b(add|plus|more|extend)\b/) && has(text, /\b(rest|time|seconds?|sec)\b|\d/)) return { command: 'add', value: last && last <= 120 ? last : 15 }
  if (has(text, /\b(done|finished|that's it|thats it|complete|completed|set done)\b/)) return { command: 'done', ...(last != null && last <= 60 ? { reps: last } : {}) }
  if (has(text, /\b(i did|did)\b/) && last != null) return { command: 'done', reps: last }
  if (last != null && has(text, /\b(reps?|repetitions?)\b/) && !has(text, /\bhow many\b/)) return { command: 'done', reps: last }
  if (has(text, /\b(pause|hold on|wait)\b/)) return { command: 'pause' }
  if (has(text, /\b(resume|play|continue|go on|unpause|start)\b/)) return { command: 'resume' }
  if (has(text, /\b(skip|next)\b/)) return { command: 'skip' }
  if (has(text, /\b(repeat|again|what's next|whats next|say that again)\b/)) return { command: 'repeat' }
  if (has(text, /\b(reset|restart|start over|from zero)\b/)) return { command: 'reset' }
  return { command: null }
}

/**
 * The count after hearing `heard` (numbers said since the set started), given the count so far.
 * Only a step a person could have made is taken: up to 4 above the current count, or a first
 * number of 6 or less. A misheard "40" in the middle of a set is ignored.
 */
export function nextCount(current, heard) {
  let c = current
  for (const v of heard) {
    if (!(v > 0)) continue
    if (c === 0 ? v <= 6 : v > c && v <= c + 4) c = v
  }
  return c
}
