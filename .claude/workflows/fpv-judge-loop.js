/*
 * fpv-judge-loop.js: a workflow script, not part of the shipped simulator.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

export const meta = {
  name: 'fpv-judge-loop',
  description: 'Judge the simulator as an FPV pilot of 10 years (physics and control realism) and as a designer (visual), then synthesise a prioritised change list',
  phases: [
    { title: 'Judge', detail: 'pilot panel and design panel in parallel' },
    { title: 'Challenge', detail: 'each verdict stress tested' },
    { title: 'Synthesis', detail: 'one prioritised change list' },
  ],
}

const REPO = '/home/user/WebFPVSimulator'
const SCRATCH = '/tmp/claude-0/-home-user-WebFPVSimulator/460d0458-519e-5633-a392-bceeae23f153/scratchpad'

const VERDICT = {
  type: 'object',
  required: ['verdict', 'score', 'findings'],
  properties: {
    verdict: { type: 'string', description: 'one paragraph overall judgement in the persona voice' },
    score: { type: 'number', description: '1 to 10' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['issue', 'why_it_matters', 'fix', 'severity'],
        properties: {
          issue: { type: 'string' },
          evidence: { type: 'string', description: 'the specific number or image detail' },
          why_it_matters: { type: 'string' },
          fix: { type: 'string', description: 'concrete, actionable' },
          severity: { enum: ['blocker', 'major', 'minor'] },
        },
      },
    },
  },
}

const PILOT_CONTEXT = `
You are judging a browser FPV quad simulator for REALISM of physics and control feel.
Repo: ${REPO}. STRICTLY READ ONLY: never edit files, never run npm/node, never write anything.

Evidence to read first:
- ${SCRATCH}/flight-report.txt   measured manoeuvre numbers from the actual sim
- ${REPO}/src/native/plant.c     the plant model (motors, props, battery, aero)
- ${REPO}/configs/betaflight-default.diff the default tune, and configs/rates.js the rates
- ${REPO}/src/native/bf/bf_glue.c how Betaflight is wired in
- ${REPO}/PROGRESS.md            known trade-offs and open questions

Reference airframe it is meant to be: 5 inch freestyle quad, 0.65 kg all up, 6S 1300 mAh,
1900 kV motors, 5x4.3x3 props, thrust to weight about 4.5 to 1.

Known and already documented, do NOT spend a finding restating them: propwash turbulence,
inflow/advance ratio in axial flight, ground effect and wind are deliberately deferred;
roll to yaw coupling measures exactly zero for a symmetric quad at this modelling order.

Be specific and quantitative. Compare against what you know real 5 inch quads do. Where the
report gives a number, say what the real number should be and why the difference matters to a
pilot's hands.`

const DESIGN_CONTEXT = `
You are judging the VISUAL DESIGN of a browser FPV quad simulator.
Repo: ${REPO}. STRICTLY READ ONLY: never edit files, never run npm/node, never write anything.

Evidence to read first:
- ${SCRATCH}/shot_fpv.png    in flight, FPV camera, 100 degree FOV, 30 degree uptilt
- ${SCRATCH}/shot_chase.png  chase camera showing the craft and the gate circuit
- ${REPO}/src/render/scene.js the whole world: sky, terrain, track, scenery, the quad

Both screenshots were captured under software rendering (SwiftShader) in a container, so
judge composition, colour, silhouette, hierarchy and readability. Do not comment on frame rate.

The brief: cel shaded, Breath of the Wild inspired, a rudimentary race track, readable at
speed. It is deliberately geometry and colour only, no texture files, no post processing.

Judge as a working art director: colour harmony, value structure, silhouette readability,
depth cues, focal hierarchy, how well a pilot can read speed, orientation and the next gate.`

phase('Judge')

const PILOT_LENSES = [
  { key: 'control', prompt: `${PILOT_CONTEXT}\n\nYour lens: STICK FEEL AND CONTROL. Rate step responses (rise time, overshoot, behaviour on stick release), rates and expo choice, whether the tune values are plausible for a real 5 inch quad, yaw authority versus roll and pitch, and how all of this would feel in the hands on a freestyle line. Pay attention to the yaw axis numbers.` },
  { key: 'flightmodel', prompt: `${PILOT_CONTEXT}\n\nYour lens: FLIGHT MODEL PHYSICS. Hover throttle and RPM, thrust to weight, punch out, top speed and how the craft carries speed, drag behaviour, battery sag and current draw, motor spool time, and whether the absolute RPM figures are credible for 6S 1900 kV on 5 inch props. Read plant.c and say where the model is honest and where it is thin.` },
  { key: 'authenticity', prompt: `${PILOT_CONTEXT}\n\nYour lens: DOES THIS FLY LIKE A QUAD. Think about what separates a real quad from a toy physics drone: how it behaves when you chop throttle, how it carries momentum through a turn, whether it feels heavy or floaty, what happens on hard direction changes, and the cues a pilot uses subconsciously. Name the single biggest thing missing that would make an experienced pilot say "this is not a quad".` },
]

const DESIGN_LENSES = [
  { key: 'colour', prompt: `${DESIGN_CONTEXT}\n\nYour lens: COLOUR AND LIGHT. Palette harmony, value structure and separation between sky, terrain and objects, the banded cel shading, aerial perspective and haze, whether the greens and blues are doing the work of a Breath of the Wild palette or reading flat and synthetic.` },
  { key: 'readability', prompt: `${DESIGN_CONTEXT}\n\nYour lens: READABILITY AT SPEED. Can a pilot instantly read orientation, altitude, speed and where the next gate is? Are the gates legible from far away and from odd angles? Do the ground and scenery give enough motion parallax to feel fast? Is the HUD helping or in the way?` },
  { key: 'composition', prompt: `${DESIGN_CONTEXT}\n\nYour lens: WORLD AND COMPOSITION. Silhouettes, scale relationships, density and placement of scenery, the horizon and mountain treatment, the quad model itself, and whether the world feels like a designed place or scattered props. What single addition would most raise the production value?` },
]

const judged = await pipeline(
  [...PILOT_LENSES.map((l) => ({ ...l, panel: 'pilot' })), ...DESIGN_LENSES.map((l) => ({ ...l, panel: 'design' }))],
  (l) => agent(l.prompt, { label: `${l.panel}:${l.key}`, phase: 'Judge', schema: VERDICT }),
  (v, l) => {
    if (!v) return null
    const top = (v.findings || []).filter((f) => f.severity !== 'minor').slice(0, 3)
    if (!top.length) return { ...l, verdict: v, survived: [] }
    return parallel(
      top.map((f) => () =>
        agent(
          `${l.panel === 'pilot' ? PILOT_CONTEXT : DESIGN_CONTEXT}

A reviewer on the ${l.key} lens raised this:
issue: ${f.issue}
evidence: ${f.evidence ?? 'none'}
proposed fix: ${f.fix}
severity: ${f.severity}

Stress test it against the actual repo and evidence. Is it TRUE, and is the proposed fix the
right one? Reject it if: the claim misreads the code or the numbers, the behaviour is a
documented deliberate deferral, the fix would break the verification harness in tests/
(read tests/thresholds.json to check the bands), or the fix trades more than it buys.
Return refuted=true to kill it, false to keep it. If the diagnosis is right but the fix is
wrong, keep it and say what the better fix is in reason.`,
          { label: `challenge:${l.key}`, phase: 'Challenge', schema: {
            type: 'object', required: ['refuted', 'reason'],
            properties: { refuted: { type: 'boolean' }, reason: { type: 'string' }, better_fix: { type: 'string' } },
          } },
        ).then((c) => ({ finding: f, challenge: c })),
      ),
    ).then((checked) => ({ ...l, verdict: v, survived: checked.filter(Boolean).filter((c) => c.challenge && !c.challenge.refuted) }))
  },
)

const ok = judged.filter(Boolean)
const pilot = ok.filter((j) => j.panel === 'pilot')
const design = ok.filter((j) => j.panel === 'design')
const surviving = ok.flatMap((j) => j.survived.map((s) => ({ lens: j.key, panel: j.panel, ...s })))
log(`${ok.length} verdicts, ${surviving.length} findings survived challenge`)

phase('Synthesis')
const brief = await agent(
  `You are the lead on the WebFPVSimulator project at ${REPO}. Two review panels just judged the
simulator: an FPV pilot of ten years on physics and control realism, and a designer on the visuals.

Pilot scores: ${pilot.map((p) => `${p.key}=${p.verdict.score}`).join(', ')}
Design scores: ${design.map((p) => `${p.key}=${p.verdict.score}`).join(', ')}

Pilot verdicts:
${pilot.map((p) => `[${p.key}] ${p.verdict.verdict}`).join('\n\n')}

Design verdicts:
${design.map((p) => `[${p.key}] ${p.verdict.verdict}`).join('\n\n')}

Findings that survived adversarial challenge:
${surviving.map((s, i) => `${i + 1}. (${s.panel}/${s.lens}, ${s.finding.severity}) ${s.finding.issue}
   evidence: ${s.finding.evidence ?? 'n/a'}
   fix: ${s.finding.fix}
   challenger: ${s.challenge.reason}${s.challenge.better_fix ? `\n   better fix: ${s.challenge.better_fix}` : ''}`).join('\n')}

Produce a single prioritised change list for the next work session. Rules: the hard constraint is
that tests/ and tests/thresholds.json are read only and npm run verify must stay at 12 of 13, so
flag any item that would move a measured value near a band edge. Order by feel-per-unit-effort:
what most changes a pilot's or viewer's impression for the least work goes first. Be concrete
enough that an engineer can start at item 1 without asking a question. Return plain markdown, no
preamble.`,
  { label: 'synthesis', phase: 'Synthesis' },
)

return {
  pilotScores: pilot.map((p) => ({ lens: p.key, score: p.verdict.score, verdict: p.verdict.verdict })),
  designScores: design.map((p) => ({ lens: p.key, score: p.verdict.score, verdict: p.verdict.verdict })),
  surviving: surviving.map((s) => ({ panel: s.panel, lens: s.lens, severity: s.finding.severity, issue: s.finding.issue, fix: s.finding.fix, note: s.challenge.better_fix ?? '' })),
  brief,
}