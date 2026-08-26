/*
 * articles.js: journey and physics pages for the FPV wiki.
 *
 * Every physics claim here is taken from src/native/plant.c, sim.c,
 * sim_abi.h, bf_glue.c, src/input/link.js, src/game/collide.js or
 * src/render/lens.js. If the code and this page disagree, the code wins
 * and this page is wrong.
 *
 * Voice: two columns on each page. "In the air" is for somebody who has
 * never held a radio. "In the lab" is for somebody who wants the equation.
 * Neither is a paraphrase of the other with longer words.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

export const CHAPTERS = [
  { id: 'start', title: 'The journey', note: 'What FPV is, and why this sim is a compiled controller plus a plant.' },
  { id: 'physics', title: 'The plant', note: 'Everything the airframe model actually computes.' },
  { id: 'control', title: 'The controller', note: 'Betaflight 4.5.1, compiled, not rewritten.' },
  { id: 'cli', title: 'Every setting', note: 'One page per Betaflight 4.5.1 catalog key, including the grey ones.' },
];

function page({
  id, chapter, title, kicker, lede, figure, air, lab, sim, related = [], source,
}) {
  return {
    id,
    chapter,
    title,
    kicker,
    lede,
    figure: figure || null,
    sections: [
      { id: 'air', title: 'In the air', paras: air },
      { id: 'lab', title: 'In the lab', paras: lab },
      { id: 'sim', title: 'In this simulator', paras: sim },
    ],
    related,
    source: source || '',
    kind: 'article',
  };
}

export const ARTICLES = [
  page({
    id: 'start-welcome',
    chapter: 'start',
    title: 'Simulating FPV, for nerds',
    kicker: 'Start here',
    lede: 'A racing quad is a small rigid body with four spinning discs, a radio, and a computer that tries 1,000 times a second to make the body rotate at the rate you asked for. This wiki is the map of that loop as this repository actually builds it.',
    figure: 'loop',
    air: [
      'First-person view flying is a camera on a quadcopter, goggles on a face, and two sticks. The left stick (Mode 2) is throttle and yaw. The right stick is roll and pitch. There are no ailerons. There is no elevator. There is no brake. You point the camera where you want to go and you push.',
      'That sounds like a toy helicopter. It is not. A 5 inch race quad on 6S has around nine times its own weight in static thrust. It can leave a hover and be at building height in a couple of seconds. It can also eat itself in a vortex of its own wake if you descend into the air you just pushed. The sport is learning those instincts until they are faster than thought.',
      'This page is not How to fly. How to fly is the sticks. This is why the sticks do what they do, why a tune file changes the feel, and which of those things this browser is actually computing.',
    ],
    lab: [
      'The architecture is two machines in one WASM module. Betaflight 4.5.1\'s control loop (rates, PID, filters, mixer, rc command handling) is compiled from vendor/betaflight. The plant (motors, props, battery, aero, rigid body) is C in src/native/plant.c. They step together at a fixed 1000 Hz. Rendering reads a snapshot and interpolates. Frame time never reaches the integrator.',
      'Units are SI throughout the physics path: metres, kilograms, seconds, radians, newtons, volts, amps. Degrees appear in the OSD, in Settings copy, and in Betaflight config values, converted at the boundary. The body frame is right-handed, x forward, y left, z up, matching Betaflight and the flight-dynamics literature. Three.js is y-up. The conversion is exactly once, in src/render/frame.js.',
      'Determinism is a requirement. No relaxed SIMD. No JavaScript Math.sin, Math.cos or Math.pow on the physics path. A compiled libm in the module, a seeded xorshift32 for wash and gyro hash, and the same input stream must hash identically in Node and in Chrome.',
    ],
    sim: [
      'Stage 1\'s original brief was a grey plane and a quad. The product around it grew: maps, a configurator, a track builder. The plant is still one 5 inch airframe. Changing motor_kv in the configurator stores a number and does not retune ke. Pack charge in Settings does. That honesty is the point of the grey rows, and of this wiki.',
      'Read the plant chapter before you chase a PID number. A lot of what people call "tune" is the airframe: sag, advance ratio, H-force, wash. The controller chapter is what compiled Betaflight does with that plant. Every setting is the last chapter, including the ones that do nothing here.',
    ],
    related: ['start-nowings', 'start-loop', 'physics-airframe', 'start-honesty'],
    source: 'CLAUDE.md, STAGE1.md, src/native/sim_abi.h',
  }),

  page({
    id: 'start-nowings',
    chapter: 'start',
    title: 'A quad has no wings',
    kicker: 'The journey',
    lede: 'Thrust is almost along the camera. Speed is a consequence of pointing that thrust through the air for a while, then pointing it somewhere else.',
    figure: 'frames',
    air: [
      'An aeroplane holds itself up with wings and changes direction with control surfaces that bite the relative wind. A quad holds itself up by pointing four props at the ground, more or less, and it changes direction by spinning. Roll right means the right motors slow and the left motors speed up, the craft rotates, and now a component of thrust is pulling you right. Pitch and yaw are the same idea on the other axes.',
      'That is why a quad has no brakes. To slow down you pitch up (or roll out of the line) so thrust fights the velocity you already have, plus the discs and the body drag. Chopping throttle in a fast descent does not "idle reverse." It drops you into your own wake.',
      'Acro mode, which is what a racer flies, does not level the craft when you centre the stick. The stick is a rate demand: how many degrees per second to rotate. Hands off means "stop rotating," not "return to level." Angle mode does the other job, and keyboard flight in this sim raises it because a key is a poor rate stick.',
    ],
    lab: [
      'Newton 2 for a rigid body: m a = sum F, I dot(omega) + omega × (I omega) = sum tau. The plant integrates those with a diagonal inertia, a quaternion attitude, and semi-implicit Euler on the linear state, all at dt = 0.001 s. Gravity is 9.80665 m/s² along world −z after the body forces are rotated out.',
      'The body-rate convention in sim_abi.h: positive p rolls right, positive q pitches nose down, positive r yaws nose left. Stick channels are RC convention (positive pitch is nose up, positive yaw is nose right). Mapping those onto Betaflight\'s internal signs is the glue\'s job. Getting one link of that chain backwards turns a loop into positive feedback. The diagnosis is in PROGRESS.md and in the comments on PLANT_SPIN.',
      'There is no lifting surface. Plan, front and side quadratic drag (0.5 rho CdA |v| v in the body frame) plus the rotor H-force are the only translational damping besides gravity and thrust. A banked turn without rudder therefore washes out the way an acro quad does: the nose does not magically track the velocity vector.',
    ],
    sim: [
      'The How to fly screen is the short version of this page, with live gimbals. This page is the reason those gimbals are enough. The plant will not grow wings. If a trajectory feels like an aeroplane, something in the drag or the H-force is wrong, and that is a plant bug, not a tune.',
    ],
    related: ['start-loop', 'physics-drag', 'physics-hforce', 'control-rates'],
    source: 'src/native/sim_abi.h, src/native/plant.c',
  }),

  page({
    id: 'start-loop',
    chapter: 'start',
    title: 'The closed loop',
    kicker: 'The journey',
    lede: 'You do not fly motors. You fly a rate loop that flies motors. The plant is what the rate loop is standing on.',
    figure: 'loop',
    air: [
      'Move the roll stick. The radio sends a packet. The flight controller turns that packet into a desired roll rate using your rates curve. It looks at the gyro. The difference is error. PID turns error into four motor duties. The motors change RPM, the props change thrust, the craft rotates, the gyro sees it, and the error shrinks. That conversation happens a thousand times a second.',
      'If the gyro is lying (vibration), the loop fights ghosts. If the motors are late (inertia, sag, advance ratio), the loop overshoots. If you ask for more rate than the airframe can produce, the motors pin and the craft does what physics allows, not what the sticker said.',
      'Feedforward is the cheat code that is not a cheat: it looks at how fast the stick is moving and starts the motors before the error appears. A perfect radio makes feedforward unnaturally clean. That is why this sim has a radio model you can turn on.',
    ],
    lab: [
      'Each 1 ms step in bf_glue.c: gyro device read (plant omega plus modelled imbalance, quantised as a 2000 deg/s 16-bit gyro), gyroFiltering, updateRcCommands and processRcCommand on the simulated clock, pidController, mixTable. Motor duties come back as the plant\'s duty vector. Dynamic idle and the RPM filter see getMotorFrequencyHz from the plant, lagged like DShot telemetry.',
      'The PID runs in degrees per second. The plant runs in radians per second. The glue converts. TPA and anti-gravity\'s throttle filter are driven from mixTable, matching Betaflight\'s own order. Calling pidController with a stale throttle was a real bug; it is called out in bf_glue.c so it is not reintroduced.',
      'Input samples carry their own timestamps. sim.c applies a sample before the 1 ms step that contains it, never by wall-clock arrival. Irregular packet times feeding a fixed-step integrator is what people read as floaty if you get this wrong.',
    ],
    sim: [
      'Save on the flight-controller screen is sim_init of a CLI dump, the same path as dropping a Betaflight diff on the page. The UI never writes a PID into the plant. Grey options are named. LIVE options reach compiled 4.5.1 parameter groups.',
    ],
    related: ['control-pid', 'physics-gyro', 'physics-radio', 'control-filters'],
    source: 'src/native/bf/bf_glue.c, src/native/sim.c',
  }),

  page({
    id: 'start-compiled',
    chapter: 'start',
    title: 'The controller is ported, not written',
    kicker: 'The journey',
    lede: 'If a Betaflight behaviour is missing, the fix is to compile more of Betaflight, not to approximate it in JavaScript.',
    figure: 'pid',
    air: [
      'Every racing sim is tempted to write "a PID" in the game engine. It will look like a PID in a plot and feel like a different aircraft, because the thing a pilot has in their head as "Betaflight" is not three gains. It is the D-term filter chain, TPA, iterm relax, anti-gravity, feedforward averaging, the mixer, airmode, and a dozen other clauses that only exist because somebody crashed into a real edge case.',
      'This project vendors Betaflight 4.5.1 and compiles the control loop to WASM. Your dump is a dump. Simplified sliders run simplified_tuning.c. The rates graph on the FC screen is a preview; the plant still runs applyRates from fc/rc.c.',
    ],
    lab: [
      'Sources compiled include pid.c, pid_init.c, mixer.c, mixer_init.c, rc.c, rc_controls.c, controlrate_profile.c, gyro filtering, rpm_filter, dyn_notch_filter (which then refuses to arm at 1 kHz), and simplified_tuning.c. Hardware is stubbed: no UART, no MSP, no OSD pixels, no GPS. Patches live in patches/ and are applied at build time. git diff --stat vendor/betaflight must be empty after a build.',
      'Licence is GPLv3 because this is a derivative work. Every file in this repository carries that header. Do not add a dependency with an incompatible licence.',
    ],
    sim: [
      'The flight-controller screen is a homage of Configurator 10.10: tab names, 4.5.1 fields, dark grey and orange. It is not that app. No Vue, no MSP, no iframe. Save writes CLI text. Readback dumps the live parameter groups so the screen cannot lie.',
    ],
    related: ['control-pid', 'start-honesty', 'cli-index'],
    source: 'CLAUDE.md, src/native/bf/bf_glue.c, patches/',
  }),

  page({
    id: 'start-honesty',
    chapter: 'start',
    title: 'Live, gated, inert',
    kicker: 'The journey',
    lede: 'A grey row is a named absence, not a hidden one. A live row reaches compiled firmware. A gated row is firmware behaving the way a 1 kHz board behaves.',
    figure: 'filters',
    air: [
      'On a real Betaflight Configurator you can set VTX channel, OSD layout, GPS rescue, LED colours. This sim has no video transmitter, no OSD overlay in the FPV view, no GPS, and no LEDs. Those keys still exist so a dump you drop is not silently eaten. They are grey. Changing them and exporting will put them in the file. They will not change how the craft flies.',
      'Some keys look like they should work and do not, for a reason that is Betaflight\'s own. The dynamic notch will not arm below a 2 kHz gyro loop. This loop is 1 kHz, same as a slower real board. The keys store. The SDFT does not run. That is GATED, not a wiring bug.',
      'Some keys store in a real parameter group that nothing in this 1 ms loop reads. motor_kv is the example everybody reaches for. The plant\'s ke is independent. The airframe is still the Stage 1 5 inch. That is APPLIED_INERT.',
    ],
    lab: [
      'src/fc/catalog.js is the only place that decides status. LIVE: writes a PG this build compiles, and that code runs. GATED: writes the PG; this firmware then ignores it at 1 kHz. APPLIED_INERT: writes a PG; nothing that flies reads it. INERT: real 4.5 CLI key, subsystem not compiled. ABSENT: Configurator chrome that is not a CLI key here.',
      'Do not treat sim_bf_key_status as enablement. Native 0 means "in the write table", which includes GATED and APPLIED_INERT. Grey-out is the catalog.',
    ],
    sim: [
      'Every catalog key has a wiki page. LIVE pages tell you what raising the value does on this plant. Grey pages tell you what the key does in life, then say plainly that it does not fly here. If a LIVE page and a flight session disagree, file a bug: that is a catalog lie.',
    ],
    related: ['cli-index', 'control-filters', 'physics-airframe'],
    source: 'src/fc/catalog.js, src/native/bf/bf_settings.c',
  }),

  page({
    id: 'start-howto',
    chapter: 'start',
    title: 'How to read this wiki',
    kicker: 'The journey',
    lede: 'Two columns, one status chip, a figure where a picture carries the load. Search the catalog. Follow related pages. Do not treat a feel report as a measurement.',
    air: [
      'In the air is the version you can tell someone at the field. In the lab is the version you could defend in a review. In this simulator is the seam: which file, which status, which check, which thing is not modelled.',
      'Figures animate unless you asked the browser for reduced motion. They are arguments, not photographs. The caption says what they are arguing.',
      'Flight feel itself is not verifiable here. npm run verify is the honest signal for the plant. A wiki page that cites a check is citing a number from that harness, not a vibe.',
    ],
    lab: [
      'Related links at the foot of a page are the intended path, not a graph of every mention. CLI pages link back to the family article (PID, rates, filters) so a single gain is never an orphan number.',
      'Sources listed on a page are file paths in this repository. They are not citations of textbooks. Where a textbook result is used (Glauert inflow, momentum-theory figure of merit, VRS gap shape), the plant comment is the citation, because that is where the implementation chose a form.',
    ],
    sim: [
      'The wiki is a screen over the live title world, same as Credits. It does not step the integrator. Opening it from pause does not change the run. It is documentation, not a second physics.',
    ],
    related: ['start-welcome', 'physics-timestep', 'cli-index'],
    source: 'src/wiki/',
  }),

  page({
    id: 'physics-airframe',
    chapter: 'physics',
    title: 'The Stage 1 airframe',
    kicker: 'The plant',
    lede: 'One 5 inch freestyle quad. Mass, motors, props and pack are constants in plant.c, not Betaflight fields.',
    figure: 'quadx',
    air: [
      'Imagine a 650 gram machine on a 6S 1300 pack, 1900 kV class 2207 motors, 5×4.3×3 props, 220 mm diagonal. That is a very ordinary 5 inch, and it is the only aircraft in this build. Switching a tune does not change the motors. Switching motor_kv in the configurator does not either.',
      'Thrust to weight at full charge is about 9.2 to 1, measured, which is what that class of quad actually has. Hover sits near a fifth of the stick. That is why racers use a throttle limit: four fifths of the stick is climb, and the hover band is a few percent.',
    ],
    lab: [
      'PlantParams: mass 0.65 kg; inertia diagonal 0.0035, 0.0038, 0.0068 kg m² (roll, pitch, yaw); arm_x = arm_y = 0.110/sqrt(2) m; kt = 1.98e-6 N/(rad/s)²; kq = 2.80e-8 N m/(rad/s)²; ke = 0.006336 V s/rad; r_motor = 0.1825 ohm; j_rotor = 8.0e-6 kg m²; 6 cells at 2.5 mOhm each; rho = 1.225 kg/m³; prop radius 0.0635 m.',
      'ke is not 60/(2 π 1900). Nameplate kV is unloaded. The loaded torque constant of these 2207s is better than the plate, which is why a thrust stand draws less current than the nameplate predicts. Forcing the nameplate ke would need kq low enough to put figure of merit above the physical band. The airframe is still a 1900 kV motor; this is its loaded constant. See the comment block at the top of plant.c.',
      'Figure of merit is enforced: kq = kt^1.5 / (FM sqrt(2 rho A)) with FM = 0.565, inside 0.4 to 0.6. An earlier pair produced FM 2.01, which is thermodynamically impossible. sim_bf_debug case 12 recomputes FM from the compiled constants.',
    ],
    sim: [
      'These numbers are not exposed as CLI. Pack charge in Settings sets cell open-circuit voltage (4.2, 3.8, 3.5 V). Everything else is the plant. A different airframe is a physics-shape change and is out of scope for a wiki page to "add."',
    ],
    related: ['physics-motor', 'physics-fm', 'physics-sag', 'start-honesty'],
    source: 'src/native/plant.c PlantParams, STAGE1.md',
  }),

  page({
    id: 'physics-timestep',
    chapter: 'physics',
    title: 'Fixed timestep and determinism',
    kicker: 'The plant',
    lede: 'Physics never reads frame time. A dropped frame must change nothing about the trajectory.',
    figure: 'timestep',
    air: [
      'The world on screen is a movie of a calculation that does not care how fast your computer draws. If the movie stutters, the quad in the calculation is still where it would have been. That is why a replay file can be bit-identical on two machines.',
      'If physics used the time between animation frames, a slow frame would be a different flight. Racers would farm luck. Verification would be theatre.',
    ],
    lab: [
      'sim.c steps at SIM_STEP_HZ 1000. sim_step(n) advances n milliseconds of simulated time. The host (src/main.js) accumulates real frame delta and spends it in 1 ms ticks. Render interpolates the two most recent physics states. Quaternion update subdivides so the small-angle libm stays inside its accurate range, then renormalises.',
      'Linear update is semi-implicit Euler: velocity first, then position, with gravity applied on world z after body forces are rotated out. Operation order is fixed. Build flags include -fno-fast-math -ffp-contract=off. No relaxed SIMD.',
      'Wash noise and gyro hash use xorshift32 with seeds in SimState / the glue, reset with the run. Integer ops to a double in a closed range. No Math.random, no float hashing of the seed.',
    ],
    sim: [
      'Checks 2, 3 and 4 in the harness are the determinism ruler: repeat in-process, Node versus Chrome, and simulated render rates 30/60/144/240 Hz. If you change rendering and the trace hash moves, a Math call or a frame delta leaked into the plant. If you change the plant and the hash does not move, the check is broken.',
    ],
    related: ['start-welcome', 'physics-wash', 'physics-gyro'],
    source: 'src/native/sim.c, src/native/sim_abi.h, CLAUDE.md',
  }),

  page({
    id: 'physics-motor',
    chapter: 'physics',
    title: 'Motors: voltage, current, lag',
    kicker: 'The plant',
    lede: 'Throttle is not thrust. Throttle is a duty cycle. Thrust is what a spinning prop does after the bell has accelerated.',
    figure: 'motor',
    air: [
      'When you punch the stick, the flight controller tells the ESC to apply more of the pack to the winding. The motor does not instantly reach the new speed. The bell has mass. The prop has mass. For a few hundredths of a second you are waiting on inertia, and that wait is a lot of what "crisp" versus "soft" feels like.',
      'Current is whatever the voltage difference across the winding resistance says, until the back EMF of the spinning motor catches up. A real ESC also has inductance and a current ceiling. This plant does not. For a couple of milliseconds a punch draws a silly current. The rotor\'s own time constant eats it before it becomes thrust. It is honest in the state block and it is not a feel defect.',
    ],
    lab: [
      'Average applied voltage is duty times pack voltage under load. i = (d V_load − ke ω) / R. Rotor: j dw/dt = ke i − spin * kq ω_rel |ω_rel|. Duty is clamped to [0, 1]. ω is clamped at 0 (no reverse on this airframe).',
      'j_rotor is 8.0e-6 kg m² against a real 2207 bell plus 5 inch triblade near 9e-6. Check 8 (0 to 100 percent duty, time to 63 percent of final RPM) wants 10 to 30 ms. 9e-6 read about 29 ms. 8.0e-6 leaves margin. An ESC current ceiling of 48 A was built, measured (peak pack 410 A to 192 A) and withdrawn because it pushed t63 to 51 ms, out of band. The limit is commented in plant.c with those numbers, not quietly omitted.',
      'Pack voltage and motor current are an algebraic loop. With real resistances a one-step lag oscillates. The plant solves it closed form: V = (Voc + Rp B / R) / (1 + Rp A / R) with A = sum d_i², B = sum d_i ke ω_i.',
    ],
    sim: [
      'dshot_idle_value is LIVE and sets the floor the mixer will not go below, the way DShot idle does. min_throttle / max_throttle / min_command are PWM-era fields; glue motorInitEndpoints uses DShot constants, so those three are APPLIED_INERT. motor_kv is APPLIED_INERT. ke stays 0.006336.',
    ],
    related: ['physics-fm', 'physics-sag', 'cli-dshot_idle_value', 'physics-advance'],
    source: 'src/native/plant.c motor loop',
  }),

  page({
    id: 'physics-fm',
    chapter: 'physics',
    title: 'Thrust, torque and figure of merit',
    kicker: 'The plant',
    lede: 'Thrust goes as RPM squared. Shaft torque goes as RPM squared. They are a physical pair, not two knobs.',
    air: [
      'A prop is a device for throwing air. How hard it throws (thrust) and how hard it is to turn (torque) are linked by the power going into that air. If you invent a prop that makes lots of thrust and needs almost no torque, you have invented a perpetual motion machine. Early in this project the numbers did that. They do not any more.',
      'Figure of merit is the ratio of ideal induced power to actual shaft power. A perfect actuator disc is 1.0. A real 5 inch lives around 0.4 to 0.6. This plant is 0.565.',
    ],
    lab: [
      'Ideal hover induced power for one disc is T^1.5 / sqrt(2 rho A). Shaft power is kq ω³. FM = P_ideal / P_shaft. With T = kt ω² this rearranges to kq = kt^1.5 / (FM sqrt(2 rho A)). A is π (0.0635)². The code does not retune kq independently of kt.',
      'Thrust after aero corrections is T = kt ω² * axial, with axial from the advance-ratio / VRS / wash / translational-lift stack. Prop drag torque uses ω_rel = spin ω + r (body yaw), so a yawing craft loads one pair and unloads the other. That residual is real yaw damping.',
    ],
    sim: [
      'Yaw authority is paid in this torque. Starve kq and yaw is mush. The old FM 2.01 plant had to fake other constants to compensate. Do not split kt and kq again.',
    ],
    related: ['physics-motor', 'physics-advance', 'physics-vrs', 'physics-yaw'],
    source: 'src/native/plant.c, PROGRESS.md OPEN QUESTIONS (historical FM 2.01)',
  }),

  page({
    id: 'physics-sag',
    chapter: 'physics',
    title: 'Battery sag',
    kicker: 'The plant',
    lede: 'The pack is a voltage behind a resistor. Draw current and the voltage the motors see falls. Available RPM falls with it.',
    figure: 'sag',
    air: [
      'A freshly charged pack punches harder than one you have been flying for two minutes, even before capacity is gone, because voltage sags under load. Pilots feel this as "the pack falling off." It is a large part of what reads as authentic, and it is why punch-out at 3.6 V per cell is a verification check, not a flavour text.',
      'Settings, Pack charge, is the open-circuit voltage per cell: 4.2 full, 3.8 mid, 3.5 empty. It is not a fuel gauge simulation. Capacity is not modelled. You will not "run out" mid-lap. You will fly a softer motor.',
    ],
    lab: [
      'r_cell = 0.0025 ohm, six cells, so r_pack = 0.015 ohm. V_load from the implicit solve above. Motor current summed as d * i when that product is positive. Check 11: identical punch-out at 4.20 V and 3.60 V per cell, peak RPM lower by 4 to 15 percent on the sagged pack.',
      'vbat_* CLI keys are INERT. The plant owns the pack. Betaflight\'s vbat_sag_compensation is LIVE: it is firmware that scales PID with a voltage it is told. The glue feeds it the plant\'s sagged cell voltage. Compensation is a controller trick, not a bigger pack.',
    ],
    sim: [
      'There is no thermal model of the pack, no C-rating, no connector resistance separate from r_cell. The 2.5 mOhm figure is "a real 6S 1300 race pack" as written in plant.c.',
    ],
    related: ['physics-motor', 'cli-vbat_sag_compensation', 'physics-airframe'],
    source: 'src/native/plant.c battery solve, tests/thresholds.json check 11',
  }),

  page({
    id: 'physics-advance',
    chapter: 'physics',
    title: 'Advance ratio and pitch speed',
    kicker: 'The plant',
    lede: 'A prop is a screw. Screw it into air that is already moving along its axis and it produces less thrust. Screw it fast enough through that air and thrust crosses zero.',
    figure: 'thrustmu',
    air: [
      'Climbing hard, the craft is chasing the air it just threw. The props bite less. That is why a punch does not keep accelerating forever, and why a dive at full throttle does not keep speeding up without bound in the thrust column (drag still matters).',
      'The axial speed each rotor sees is the craft\'s up-through-the-disc speed plus the bit from rolling or pitching (the rising motor is climbing through the air, the falling motor is descending). The rising side loses thrust. That is aerodynamic rate damping. Without it the PID is the only thing stopping a rotation, and the craft snaps back when you centre the stick.',
    ],
    lab: [
      'va = v_body_z + p y_m − q x_m. pitch_speed = max(ω, 60) * k_inflow. k_inflow is prop pitch radius: 4.3 inch pitch / 2π = 0.017382 m/rad. mu = va / pitch_speed. For mu ≥ 0, axial = max(0, 1 − mu). For −0.30 < mu < 0, axial = 1 − mu (windmill, thrust rises). Deeper descents take the VRS branch.',
      'ω is floored at 60 rad/s in the pitch-speed denominator so a stopped rotor does not divide by zero. Blade-element linearisation: thrust crosses zero when axial speed reaches pitch speed. That is a model, not a CFD of a 5×4.3×3.',
    ],
    sim: [
      'STAGE1.md originally deferred "inflow and advance ratio" to Stage 2. The code has it. The wiki describes the code. A comment in plant.c records an older paragraph that claimed only the rotational part was used; both parts have been used since this model landed.',
    ],
    related: ['physics-vrs', 'physics-wash', 'physics-damping', 'physics-fm'],
    source: 'src/native/plant.c advance ratio block',
  }),

  page({
    id: 'physics-vrs',
    chapter: 'physics',
    title: 'Vortex ring state',
    kicker: 'The plant',
    lede: 'Descend into the air you just pushed and the disc can start eating a doughnut of its own wake. Thrust falls. The craft sinks. Pilots call the ugly edge of this "falling through."',
    figure: 'vrs',
    air: [
      'Helicopters have a famous version of this. Multirotors have it too, just on four small discs. A gentle descent can actually make more thrust (the props are being helped by air coming from below). Past a point that smooth picture breaks. The wake recirculates. You lose authority, often while the motors sound like they are still working.',
      'The recovery is the same as a helicopter\'s: stop descending into it. Pitch out, add power on a disc that is moving into clean air, or accept that a props-level drop will get mushy in the middle of the sink.',
    ],
    lab: [
      'Onset mu = −0.30, full at −1.20, floor axial = 0.75. Between onset and full, axial interpolates linearly from (1 + 0.30) down to 0.75, then holds. That is the shape of the momentum-theory gap, not a fitted "feel" curve. An earlier model used axial = 1 − va/pitch_speed clamped at 1.35 for every descent, which handed the craft more thrust the faster it fell (measured T/W 1.063 hover to 1.434 at 6.2 m/s sink) and deleted rate damping because a clamp has zero derivative.',
      'PLANT_INFLOW_ASYM = {0.031, −0.017, −0.028, 0.014} is applied when axial < 1, scaled by depth. Four rotors in a recirculating field do not stall together. Without this the losses cancel into a pure heave. The four values sum to zero so a fully symmetric deep descent does not invent net extra thrust.',
    ],
    sim: [
      'This is mean thrust loss. The shake on top of it is the next page. Checks 5 to 12 were measured against this loss model; wash is gated so those vertical checks do not move.',
    ],
    related: ['physics-wash', 'physics-advance', 'physics-etl'],
    source: 'src/native/plant.c PLANT_VRS_* and descent branch',
  }),

  page({
    id: 'physics-wash',
    chapter: 'physics',
    title: 'Propwash',
    kicker: 'The plant',
    lede: 'The ugly, living part of a descent or a chopped pull-out. The tune fights air that is not going where a steady model says it is.',
    figure: 'wash',
    air: [
      'Diving into your own wake, hauling out of a dive, chopping throttle over the top of a flip: a real quad shakes. You feel it in the video and in the stick as the flight controller chases a gyro that will not sit still. A sim without this is glass. A sim with too much of this is a washing machine.',
      'It is gated on descent into the wake. Climbing, you fly into clean air. Hovering, you are not in the ring. The shake lives where the ring lives.',
    ],
    lab: [
      'Depth is not mu. Depth is descent rate against induced velocity v_h = sqrt(T / (2 rho A)). Recirculation begins around 0.25 v_h, is worst near 1.0, and is carried out to 3.0 v_h because the frame, pack and arms shed wake the discs sit in (a clean isolated rotor would be done by ~2). Triangle: (rw − 0.25)/0.75 up to 1, then (3 − rw)/2 down.',
      'Unsteady field: one channel per rotor, xorshift32, two one-pole filters at 30 Hz and 3 Hz (coefficients 0.171796 and 0.018673 at 1 kHz), RMS 0.16730 measured over four million samples, clamp 3 sigma. Applied as axial += axial * k_propwash * depth * wash, k_propwash = 0.08. 0.30 put peak-to-peak gyro near 45 to 59 deg/s and a pilot called it too hot. 0.08 is a feel constant. The mechanism is not.',
      'The field runs every step so flying into the wash does not restart the turbulence. It is applied only in proportion to depth. Below ~3 Hz an I term trims it. Above ~30 Hz the D filter eats it. Neither is what wash feels like.',
    ],
    sim: [
      'Grass flattening in the renderer is a picture of downwash, not this model. Do not tune k_propwash from the grass. STAGE1.md deferred propwash; the plant has it. Render wash and plant wash are cousins, not a coupling.',
    ],
    related: ['physics-vrs', 'physics-gyro', 'physics-damping'],
    source: 'src/native/plant.c PROPWASH comment and wash filters',
  }),

  page({
    id: 'physics-etl',
    chapter: 'physics',
    title: 'Translational lift',
    kicker: 'The plant',
    lede: 'A hovering disc flies in its own downwash. Move it sideways and it meets fresh air. Thrust rises at the same RPM. Helicopter pilots call this ETL. It is real on a quad.',
    figure: 'etl',
    air: [
      'Accelerate out of a hover without touching the throttle and the craft gets lighter. A fast pass needs less stick to hold altitude than a hover does. That is not a bug in the radio. The discs are working in cleaner air.',
      'If a sim misses this, the hover and the cruise feel like two different aircraft glued together, and you will hunt the throttle in a way a real 5 inch does not ask for.',
    ],
    lab: [
      'kt is calibrated so axial = 1 is hover, which already has hover induced velocity baked in. The missing piece is the change in v_i. Correction axial_gain = (v_h − v_i) / pitch_speed, identically zero in a hover or vertical climb, capped at 0.35 because at idle pitch speed collapses faster than v_i and the ratio runs away.',
      'v_i from the same Glauert quartic the H-force uses, solved from ideal thrust kt ω² (the actual thrust is what this expression is about to produce). Two solves of the same relation per rotor per step, because iterating inside a fixed 1 ms step is not on offer.',
    ],
    sim: [
      'Vertical checks 5, 6, 7 and 11 do not see this term by construction (v_perp ≈ 0). If a future airframe flies those checks in a breeze, this page needs a rewrite.',
    ],
    related: ['physics-hforce', 'physics-advance', 'physics-vrs'],
    source: 'src/native/plant.c TRANSLATIONAL LIFT block',
  }),

  page({
    id: 'physics-hforce',
    chapter: 'physics',
    title: 'Rotor drag, the H-force',
    kicker: 'The plant',
    lede: 'The dominant damping at race speed. Quadratic body drag fitted to top speed is too slippery in the middle. This is the term that makes a corner follow the nose.',
    figure: 'hforce',
    air: [
      'A spinning disc moving sideways through the air pulls backward. Helicopter people call it H-force. On a quad it is why the craft decelerates when you level off, why a sideways slide dies, and why a 45 degree flare actually brakes instead of skating.',
      'Without it, measured on an earlier build: levelled at 20 m/s on hover throttle, half the speed was still there 3.2 seconds later, and a 50 degree bank flew a 29 m radius because the craft kept sliding out. Pilots called that floaty.',
    ],
    lab: [
      'H = k rho A v_i v_perp per rotor. v_i from Glauert: v_i = v_h² / sqrt(v_perp² + v_i²), closed form y² = 2 / (sqrt(x⁴+4) + x²) written that way to avoid cancellation at large x. At low speed y → 1 and H is linear in v_perp. At high speed y → 1/x and H saturates at k T / 2, so it does not steal the top end. A linear-only attempt took max level speed from 139 km/h to 87.',
      'k = 0.43842, anchored on a published ~0.30 /s linear drag at hover for a 0.6 kg five inch: 4 rho A v_h = 0.444787 kg/s, k = 0.65 * 0.30 / 0.444787. That published figure already contains some parasitic drag, so k is an upper bound. Body CdA was then reduced so the plant does not charge twice.',
      'In-plane force at z = +0.020 m produces a nose-up couple in forward flight and a roll-away couple in a slide. Translation: the four z-moments from symmetric H cancel; the omega × r part leaves yaw damping.',
    ],
    sim: [
      'Roll and pitch rates move rotors vertically, so they produce no H-force and rate response is untouched. Climb and punch through the disc are untouched. That is why this term could land without moving checks 5 to 12.',
    ],
    related: ['physics-noseup', 'physics-drag', 'physics-etl', 'physics-yaw'],
    source: 'src/native/plant.c section 3b ROTOR DRAG',
  }),

  page({
    id: 'physics-drag',
    chapter: 'physics',
    title: 'Airframe drag',
    kicker: 'The plant',
    lede: 'The body is a bluff object. Plan, front and side areas are different on purpose.',
    air: [
      'Belly into the wind (a flare) hits more area than nose-in. Sideways is not the same as nose-in either: the pack is a brick, longer than it is wide. Copying one number onto all three axes makes the craft equally slippery every way, which no real 5 inch is.',
    ],
    lab: [
      'F_body_a = −0.5 rho CdA_a v_a |v_a|. cda_plan = 0.0225 m², cda_front = 0.0130 m², cda_side = 0.0147 m². Front is roughly 0.011 m² of projected junk at Cd ≈ 1.2. Side adds the pack\'s extra 35×75 mm face, about 0.0017 m² of CdA. Plan is the belly, including the fact that four discs have their own H-force modelled separately, so plan is not allowed to stand in for rotor drag.',
      'These were 0.016 across the board when H-force did not exist, and they were doing two jobs. Re-fit after H-force against the max level speed procedure (128 km/h in a 120 to 165 band).',
    ],
    sim: [
      'Quadratic in speed, so it is weak in the middle and strong at the top. That is why H-force had to exist. Body drag still sets the high-speed ceiling together with advance ratio and sag.',
    ],
    related: ['physics-hforce', 'physics-airframe', 'physics-advance'],
    source: 'src/native/plant.c cda_* comments',
  }),

  page({
    id: 'physics-noseup',
    chapter: 'physics',
    title: 'Pitch up at speed',
    kicker: 'The plant',
    lede: 'The discs sit above the centre of gravity. Rearward rotor drag is therefore a nose-up moment. Every multirotor carries this. A sim that flies fast with the stick centred is telling on itself.',
    figure: 'hforce',
    air: [
      'Go fast, hands off pitch, and a real quad wants to lift the nose. You trim it with a little forward stick, the way you trim a tail-heavy model. Chop throttle at speed and the nose attitude change is part of the deceleration, not just drag.',
      'If the motors are modelled in the same plane as the CG, thrust and H-force have no pitch lever from z. The craft is a flat plate. That was this plant. It is not any more.',
    ],
    lab: [
      'PLANT_POS_Z = 0.020 m for all four. Geometry: arms at the mid plate, disc about 28 mm above that after bell and hub, CG of a 650 g machine with a 250 g pack on top about 8 mm above the plate, difference ~20 mm. A pure z force at (x, y, z) has moment (y F, −x F, 0): hover and punch checks cannot move. In-plane H at that z is the couple.',
    ],
    sim: [
      'Measured before this term: pitching moment in forward flight identically zero at every speed. That is one of the loudest tells that a simulator is not a quad.',
    ],
    related: ['physics-hforce', 'physics-cant', 'physics-airframe'],
    source: 'src/native/plant.c PLANT_POS_Z comment',
  }),

  page({
    id: 'physics-cant',
    chapter: 'physics',
    title: 'Motor cant and roll-to-yaw coupling',
    kicker: 'The plant',
    lede: 'A perfectly symmetric QUADX cannot yaw from a roll at this modelling order. Real frames are not symmetric. The coupling you trim with yaw is build tolerance.',
    figure: 'cant',
    air: [
      'Roll hard and a real quad yaws a little. You carry a bit of yaw trim, or you ride it. Sims that show zero are not "clean." They are too perfect. The motors are never aimed at the sky to a tenth of a degree.',
      'This plant gives each motor a fixed misalignment, less than two degrees, the sort of thing a moulded arm and four screws produce. Hover I-term trims the tiny leftover the way a real machine does.',
    ],
    lab: [
      'Algebra: roll column (−1, −1, +1, +1), each pair one CW and one CCW, so sum_m SPIN[m] f(roll[m]) = 0 for any f. RPM-squared drag, stator reaction, net angular momentum, advance ratio: all pairwise cancel. Inflow asymmetry does not save check 10 on a symmetric frame.',
      'Tangential cant (deg): −0.9, +1.4, +0.6, −1.2. Scalar sum −0.1 deg (hover yaw bias). Sum against the roll column −1.1 deg (the coupling). Sign: right roll yaws nose right, matching check 10\'s expected_sign. Radial cant {1.4, 0.85, 1.15, 0.6} outward is solved so the tangential set\'s net in-plane force is cancelled at hover. Radial cannot yaw: a force along r has zero z moment.',
      'These numbers are a model of build tolerance, chosen, not scanned. Check 10\'s 2.0 degree floor has historically been larger than what this tolerance produces under a yaw PID. OPEN QUESTIONS in PROGRESS.md holds that argument. The wiki does not pretend the floor is met.',
    ],
    sim: [
      'Do not add a scripted yaw-on-roll. The project rule is that coupling falls out of the physics. If a human re-bands check 10, that is a threshold decision, not a cant-table decision.',
    ],
    related: ['physics-yaw', 'physics-gyroscopic', 'start-honesty'],
    source: 'src/native/plant.c PLANT_CANT_*, PROGRESS.md check 10',
  }),

  page({
    id: 'physics-yaw',
    chapter: 'physics',
    title: 'Yaw: stator reaction and drag torque',
    kicker: 'The plant',
    lede: 'Yaw is paid in prop drag. Speed up the CCW pair and the frame yaws the other way. There is no tail rotor.',
    figure: 'quadx',
    air: [
      'On a quad, yaw is the leftover of four props fighting each other. Ask for nose-right and the mixer speeds one spin pair and slows the other. The frame feels the reaction. It is weaker than roll or pitch, slower to build, and it couples into everything else because those same motors are also your lift.',
      'That is why yaw feels late on a badly set idle, why it dies in a punch when the motors are pinned, and why airmode matters: at zero throttle without airmode, the mixer has nothing to work with.',
    ],
    lab: [
      'Stator reaction on the frame is −spin * ke * i along the motor axis (canted). Prop drag is kq ω_rel |ω_rel|. Mixer yaw column with yaw_motors_reversed off: RR −1, FR +1, RL +1, FL −1, and mixer.c negates the yaw PID sum. Glue gyro yaw feed is +r. The comment on PLANT_SPIN is the sign-chain bible. Flip one link and the loop runs away.',
      'Integrated yaw (use_integrated_yaw) is a Betaflight mixer option that treats yaw as an integral of motor difference. It is LIVE if compiled. Default off on this airframe\'s dumps unless a preset sets it.',
    ],
    sim: [
      'yaw_motors_reversed is LIVE. Turning it on without reversing the plant spin table is how you build a yaw runaway. Do that on purpose only if you are testing the glue.',
    ],
    related: ['physics-cant', 'physics-fm', 'control-mixer', 'cli-yaw_motors_reversed'],
    source: 'src/native/plant.c PLANT_SPIN, src/native/bf/bf_glue.c',
  }),

  page({
    id: 'physics-damping',
    chapter: 'physics',
    title: 'Aerodynamic rate damping',
    kicker: 'The plant',
    lede: 'The air opposes rotation even before the PID does. Without that, centring the stick feels like a rubber band.',
    air: [
      'Roll the craft and one side\'s props are climbing, the other side\'s are sinking. Climbing props make less thrust, sinking props make more (until VRS). The difference fights the roll. Yaw has the drag-torque version: body yaw adds to one spin pair and subtracts from the other.',
      'Pilots describe the missing version as snap-back: you let go and the craft overshoots the stop, then the PID yanks it back. Some of that is D gain. A lot of it, on a plant with no aero damping, is the loop standing in for physics.',
    ],
    lab: [
      'Roll/pitch: va includes p y − q x, so axial(mu) has a derivative with respect to rate. The VRS clamp at 1.35 in the old model zeroed that derivative. Yaw: w_rel = spin ω + r. H-force adds a small extra yaw damping from omega × r on the discs.',
    ],
    sim: [
      'If a tune that is calm on a real 5 inch oscillates here, look at damping and gyro hash before you cut P. If a tune that is calm here oscillates on a real 5 inch, look at filters: this gyro is still cleaner than a bent-bell machine.',
    ],
    related: ['physics-advance', 'physics-vrs', 'physics-hforce', 'control-pid'],
    source: 'src/native/plant.c motor loop preamble',
  }),

  page({
    id: 'physics-gyroscopic',
    chapter: 'physics',
    title: 'Gyroscopic coupling',
    kicker: 'The plant',
    lede: 'Spinning bells are gyroscopes. Tilt the craft and they argue. The Euler term on the airframe does the same with the inertia tensor.',
    air: [
      'A spinning wheel wants to keep spinning about the same axis. Force it to pitch and it tugs on yaw, and vice versa. Four props with opposed spin cancel a lot of this. They do not cancel all of it, especially when RPM is not matched, which is every time you roll.',
    ],
    lab: [
      'tau includes − omega × (I omega + h_prop). h_prop is sum spin * j_rotor * ω along each motor axis. I is diagonal, so the body term is the usual product-of-inertia-free Euler coupling. Opposed props keep net h_prop small in a hover and not small during a roll, when one pair is wound up.',
    ],
    sim: [
      'This is not "precession feel" as a slider. It falls out. If someone wants it stronger they need heavier bells or a different spin map, which is an airframe change.',
    ],
    related: ['physics-yaw', 'physics-cant', 'physics-motor'],
    source: 'src/native/plant.c section 4 omega × (I omega + h)',
  }),

  page({
    id: 'physics-gyro',
    chapter: 'physics',
    title: 'Gyro vibration',
    kicker: 'The plant',
    lede: 'A perfectly clean gyro makes the whole filter chain decorative and makes D gain free. Neither is true on a real 5 inch, so it is not true here.',
    figure: 'filters',
    air: [
      'The flight controller is bolted to a vibrating frame. Props are never perfectly balanced. What the gyro reports is rotation plus shake. Filters exist to keep the PID from chasing the shake. If you turn the filters down on a quiet sim, you will look like a hero and then oscillate on grass.',
      'This sim adds shake to the sensor reading, not to the rigid body. The airframe is still a rigid body. The only way vibration reaches the trajectory is the way it does in life: the controller reacting to it.',
    ],
    lab: [
      'Two parts in bf_glue.c. (1) Once-per-rev imbalance lines at each rotor\'s true frequency, amplitude ~ ω², four slightly different factors, roll sine / pitch cosine of the same phase, yaw at 0.5 (chosen coupling, not a modal analysis). (2) Broadband 80 to 350 Hz hump, same one-pole pair idea as wash. Plus a 0.2 deg/s floor for the sensor itself.',
      'A 1 kHz gyro cannot represent anything above 500 Hz. Prop fundamental is ~130 Hz idle to ~426 Hz full, under Nyquist. Blade passing (3× on a triblade) is not modelled. Amplitudes: 1.5 deg/s hump and 0.8 line after a louder set was called too much on the sticks. RMS divisor 0.340474 measured over eight million samples.',
      'The device path is SITL-style: float deg/s, then int16 counts at 2000 deg/s full scale, then Betaflight\'s own gyro.c filter chain.',
    ],
    sim: [
      'This is why gyro_lpf and rpm_filter are not vanity. Dynamic notch still will not arm at 1 kHz; the lines are there for the RPM filter and for any future loop-rate debate. The yaw-share 0.5 is the one chosen number in this block and is labelled as such in the glue comment.',
    ],
    related: ['control-filters', 'physics-wash', 'cli-rpm_filter_harmonics', 'cli-gyro_lpf1_static_hz'],
    source: 'src/native/bf/bf_glue.c GYRO VIBRATION',
  }),

  page({
    id: 'physics-radio',
    chapter: 'physics',
    title: 'The radio link',
    kicker: 'The plant',
    lede: 'No radio has a mathematically exact packet grid. Feedforward and RC smoothing both watch that grid. Perfect is a choice, and it is the default so records do not move under you.',
    figure: 'radio',
    air: [
      'Your sticks are not wired to the flight controller. A packet leaves the radio, spends a few milliseconds in the air and in the receiver, and sometimes never arrives. ELRS at 250 Hz is a common race setup: about 4 ms of delay, a fraction of a millisecond of jitter, rare losses.',
      'A perfect link feels slightly too sharp, like the craft is glued to your fingers. Turn on ELRS in Settings if you want the radio you actually own. Leave Perfect on if you are chasing a time or running the harness.',
    ],
    lab: [
      'src/input/link.js. Presets: perfect (250 Hz, 0 delay, 0 jitter, 0 loss), elrs500, elrs250, elrs150, crossfire. Jitter uniform in ±jitterMs. Loss in parts per million. Seeded xorshift32, same discipline as wash. The module never sees the generator: it sees timestamped samples. A .rec file captures what was delivered.',
      'Feedforward is d(setpoint)/d(rc frame). A jitter-free denominator is smoother than hardware. RC smoothing auto-tunes cutoffs from the measured interval; a perfect interval picks a filter no real link would get.',
    ],
    sim: [
      'Not inside the WASM module, on purpose. Putting it there would make the trace hash depend on a link seed and break existing recordings. The harness runs with the link off.',
    ],
    related: ['control-ff', 'cli-rc_smoothing', 'physics-timestep'],
    source: 'src/input/link.js',
  }),

  page({
    id: 'physics-ground',
    chapter: 'physics',
    title: 'Ground, collisions, no ground effect',
    kicker: 'The plant',
    lede: 'The rigid-body plant is free air. The shell decides when you have landed, crashed, or clipped a gate, and it may bounce the state with sim_deflect.',
    figure: 'collide',
    air: [
      'You can land. A gentle arrival onto grass or a deck is a landing: the craft sits, the integrator stops, and you can spool up again. A fast arrival or a bad attitude is a crash. Hitting a gate frame, a tree, a wall is a hit, and enough hits end the run.',
      'You cannot hover in ground effect. There is no cushion over the grass. That is a real aerodynamic phenomenon this plant does not have, and the wiki will not pretend the landing logic is that cushion.',
    ],
    lab: [
      'collide.js: one primitive, a capsule. Swept sphere (craft radius derived from the 220 mm diagonal plus 5 inch props) against capsules, closed-form segment-to-segment distance, no allocation in the query. Broadphase grid. Optional sim_deflect writes a velocity change into the module without stepping frame time into the integrator.',
      'Ground in main.js is a swept test of the craft\'s lowest point against terrain height, with a landing-versus-crash judgement on speed and tilt. While landed, sim_step is not called. Takeoff resumes from the velocity at the landing judgement so it does not inherit a buried downward spike.',
    ],
    sim: [
      'STAGE1.md deferred ground effect and wind. They are still deferred. Wind audio exists; wind force does not. If you feel a breeze, it is a picture and a sound.',
    ],
    related: ['physics-airframe', 'physics-vrs', 'start-honesty'],
    source: 'src/game/collide.js, src/main.js ground contact, src/native/sim.c stand constraint',
  }),

  page({
    id: 'physics-missing',
    chapter: 'physics',
    title: 'What this plant does not do',
    kicker: 'The plant',
    lede: 'A list of absences, so a scientist does not have to reverse-engineer silence.',
    air: [
      'No wind. No ground cushion. No blade-element theory with azimuthal stations. No aeroelasticity. No motor inductance. No ESC current limit. No thermal model of windings, packs or ESCs. No flexible arms. No camera latency separate from the radio. No video compression. No goggle overlay from Betaflight OSD.',
      'Some of those are coming if the project grows. Some are structurally refused (a general-purpose physics engine). This page is the contract as of the code this wiki was written against.',
    ],
    lab: [
      'No reverse motor direction (3D). No servos. No GPS / mag / baro / accelerometer hardware (attitude for ANGLE comes from the plant quaternion). No dual gyro. No dynamic notch at 1 kHz. No blade-passing harmonics. No trailing-vortex interaction beyond the VRS / wash / inflow-asymmetry stack. No ground-effect inflow image system.',
      'Collision is not a contact Jacobian in the plant. It is a shell query. The plant can be stood on a hinge (launch stand) inside sim.c; that is a constraint, not an aero model.',
    ],
    sim: [
      'If you need a phenomenon for a paper, read the source, do not assume a textbook rotor. The Glauert and momentum-theory pieces are labelled. The feel constants (k_propwash, gyro line/hump amplitudes, cant table) are labelled as chosen. Mixing those two categories is how a wiki becomes fiction.',
    ],
    related: ['physics-vrs', 'physics-wash', 'physics-motor', 'start-honesty'],
    source: 'STAGE1.md Not in Stage 1, plant.c ESC ceiling comment, catalog.js INERT_REASONS',
  }),

  page({
    id: 'physics-lens',
    chapter: 'physics',
    title: 'The camera, which is not the plant',
    kicker: 'The plant',
    lede: 'FOV and tilt are how you see the world, not how the world flies. They still change what you can fly, because a racer flies a picture.',
    air: [
      'Camera angle is the TPU mount. Zero looks along the nose. 30 is a cruise. 45 to 55 is race. It does not change thrust. It changes where "forward" is on your face, so you will fly a different line.',
      'Field of view in this sim is not the number printed on an FPV lens. Those lenses are fisheyes. The renderer is rectilinear. Matching the printed 150 degrees makes gates look tiny. The default 85 degrees vertical is a centre-magnification match to a ~155 degree fisheye, with a little extra width so you can see the next gate.',
    ],
    lab: [
      'src/render/lens.js. Equidistant fisheye r = f θ versus rectilinear r = f tan θ. Equal centre scale: tan(v/2) = θ_V. A 155° diagonal on 4:3 has vertical half angle 46.5° = 0.8116 rad, so v ≈ 78°. Default 85° on 16:9 is about 117° wide. GATE_SCALE and WORLD_SCALE cannot fix apparent size: a bigger gate seen from proportionally further away is the same picture.',
      'Coordinate conversion in frame.js: x_three = −y_sim, y_three = z_sim, z_three = −x_sim. Get this wrong and yaw signs rot for a month.',
    ],
    sim: [
      'Settings owns tilt and FOV. Betaflight fpv_mix_degrees is APPLIED_INERT: BOXFPVANGLEMIX is never raised, so rc.c never mixes camera angle into roll/yaw. Your neck does that. The FC does not.',
    ],
    related: ['cli-fpv_mix_degrees', 'start-nowings', 'physics-timestep'],
    source: 'src/render/lens.js, src/render/frame.js',
  }),

  page({
    id: 'control-pid',
    chapter: 'control',
    title: 'PID, the three gains people mean',
    kicker: 'The controller',
    lede: 'P is now. I is memory. D is brakes. They run in compiled pid.c on a filtered gyro, not on the plant\'s true omega.',
    figure: 'pid',
    air: [
      'P: if you are rolling slower than you asked, push the motors harder, in proportion. Too little and the craft is lazy. Too much and it buzzes.',
      'I: if a lasting error remains (a nose-up couple at speed, a cant, a wind that does not exist here), accumulate it and push until it is gone. Too little and the craft drifts. Too much and it winds up, then lets go in a lurch. I-term relax exists because flips would otherwise wind I into a punch when you stop.',
      'D: if the error is changing fast, oppose that change. It damps overshoot. It also amplifies gyro noise, which is why D has its own filter and why D max (still stored as d_min in 4.5) lets you run low D in the hover and more D when you slam the stick.',
    ],
    lab: [
      'Error = setpoint − gyro, deg/s, after the gyro filter chain. P = Kp e. I integrates e with windup limits, relax, and rotation options. D is Kd times a filtered derivative of gyro (not of error), which is why D does not fight a clean stick. F is feedforward from setpoint derivative, not from error. TPA attenuates P and D (or D only) as throttle rises. Anti-gravity boosts I (and optionally P) when throttle changes fast, so a punch does not bow.',
      'Gains are firmware units, not SI. Axis values are separate. Yaw D is often low or zero on real 5 inches because yaw measurement is noisier and yaw inertia is higher. pidsum_limit clamps the sum before the mixer so one axis cannot eat all the motor range.',
    ],
    sim: [
      'All of p_*, i_*, d_*, f_* are LIVE. Changing them writes pidProfiles(0) and the next sim_init flies it. There is no JavaScript PID. Blackbox in this build is a CSV the shell can dump, not onboard flash.',
    ],
    related: ['control-ff', 'control-filters', 'control-tpa', 'cli-p_roll'],
    source: 'vendor/betaflight .../flight/pid.c, bf_glue.c pidController call',
  }),

  page({
    id: 'control-rates',
    chapter: 'control',
    title: 'Rates: how far the stick goes',
    kicker: 'The controller',
    lede: 'A tune is P, I, D, F and filters. Rates are yours. They live in a rate profile so switching Karate does not also steal your max rate.',
    air: [
      'Max rate is how fast the craft will rotate at full stick, in degrees per second. Centre sensitivity is how twitchy the middle is, not the rate at half stick. Expo bends the middle down so you can aim without becoming slow at the edge.',
      'This sim defaults to Betaflight 4.5.1 ACTUAL rates: 670 deg/s at full stick, 70 deg/s per stick unit at centre, no expo. ACTUAL is the curve whose ends mean what they say. Other types (BETAFLIGHT, KISS, RACEFLIGHT, QUICK) are LIVE and use Betaflight\'s own apply*Rates in fc/rc.c.',
    ],
    lab: [
      'ACTUAL, from applyActualRates: centreSensitivity = rc_rate * 10, stickMovement = max(0, srate * 10 − centreSensitivity), angleRate = stick * centreSensitivity + stickMovement * expof, with expof using a 5th-power blend. At full stick expof is 1, so rate = srate * 10. rc_rate and srate are stored in tens of deg/s in a uint8.',
      'configs/rates.js is the only place the menu decides rates. Tune files do not carry a rateprofile. The FC rates page can still write a full profile, including per-axis values and throttle limit SCALE.',
    ],
    sim: [
      'The graph on the FC screen is src/fc/ratescurve.js, a display copy of those formulas. The plant does not use it. Check 9: full roll stick tracks configured max rate within 3 percent. Check 12: two diffs that differ only in srate produce max rates in that ratio.',
    ],
    related: ['cli-rates_type', 'cli-roll_srate', 'cli-roll_rc_rate', 'cli-throttle_limit_type'],
    source: 'configs/rates.js, vendor/betaflight .../fc/rc.c, src/fc/ratescurve.js',
  }),

  page({
    id: 'control-filters',
    chapter: 'control',
    title: 'Filters: delay versus noise',
    kicker: 'The controller',
    lede: 'Every filter you add makes the PID later. Every filter you remove makes the PID chase shake. The art is spending delay where noise would have cost more.',
    figure: 'filters',
    air: [
      'Gyro low-pass: smooth the sensor before anyone else sees it. D-term low-pass: extra smoothing on the branch that is most allergic to hash. Static notches: cut a known whistle. RPM filter: cut the whistle that moves with motor speed. Dynamic notch: hunt peaks in a spectrogram. At 1 kHz Betaflight will not run that last one.',
      'PT1 is the gentle one-pole. PT2 and PT3 are steeper and later. Biquad can be a notch or a peak depending on how you set it. Lower Hz is more smoothing. Zero on some static notches means off.',
    ],
    lab: [
      'Gyro path is sensors/gyro.c, compiled. RPM filter is flight/rpm_filter.c, fed by getMotorFrequencyHz. Dynamic notch is compiled and then DYN_NOTCH_UPDATE_MIN_HZ refuses it. D-term filters live in pid_init.c / pid.c. yaw_lowpass_hz is extra yaw smoothing because that axis is dirty.',
      'Simplified filter sliders rewrite the Hz values through simplified_tuning.c. They are LIVE. Turning simplified_gyro_filter off leaves the Hz you typed.',
    ],
    sim: [
      'The injected imbalance lines are exactly what the RPM filter is for. If you disable RPM filtering and cut gyro_lpf1 to 0 on a punch, you should expect D to get lively. That is the plant and the glue doing their job, not a broken tune page.',
    ],
    related: ['physics-gyro', 'cli-gyro_lpf1_static_hz', 'cli-rpm_filter_q', 'cli-dyn_notch_count'],
    source: 'bf_glue.c, patches/0001, catalog.js GATED dyn_notch',
  }),

  page({
    id: 'control-ff',
    chapter: 'control',
    title: 'Feedforward',
    kicker: 'The controller',
    lede: 'Start the motors when the stick moves, before the error exists. It is why a good tune feels connected rather than waiting to be wrong.',
    air: [
      'P waits for a mistake. Feedforward watches the stick and assumes you meant that rotation. Raise it and the craft leads. Too much and it overshoots, especially on a radio with jitter, because jitter looks like a violent stick.',
      'Smoothing, averaging, jitter reduction and max-rate limiting exist because raw d(setpoint)/dt on a 250 Hz packet stream is a spiky mess. A perfect link in this sim under-stresses those clauses. Try ELRS 250 Hz if you are tuning F.',
    ],
    lab: [
      'f_roll / f_pitch / f_yaw are the gains. feedforward_averaging is a 2/3/4 point moving average on the derivative. feedforward_smooth_factor is a further low-pass. feedforward_jitter_factor attenuates small spikes. feedforward_boost emphasises the start of a move. feedforward_max_rate_limit keeps FF from asking more than the rates curve. feedforward_transition blends FF in as the stick leaves centre.',
      'All LIVE, pid.c and rc.c, compiled.',
    ],
    sim: [
      'Keyboard flight in angle mode does not need race FF. Radio acro does. If FF feels "too good to be true" on Perfect, that is the link page, not a superhuman plant.',
    ],
    related: ['physics-radio', 'control-pid', 'cli-f_roll', 'cli-feedforward_jitter_factor'],
    source: 'vendor/betaflight flight/pid.c feedforward, src/input/link.js',
  }),

  page({
    id: 'control-tpa',
    chapter: 'control',
    title: 'TPA, anti-gravity, airmode',
    kicker: 'The controller',
    lede: 'Three clauses that exist because a quad at hover and a quad at full punch are not the same plant from the PID\'s point of view.',
    figure: 'mixer',
    air: [
      'TPA (throttle PID attenuation): at high throttle the props bite harder and P/D that were right in a hover become too much. TPA turns them down above a breakpoint. tpa_low does the opposite at very low throttle, where authority is scarce.',
      'Anti-gravity: punch the throttle and the craft would bow (pitch or roll error while I is too slow). AG boosts I, and optionally P, during a fast throttle change. It is not a gravity sensor. It is a high-pass on throttle.',
      'Airmode: keep PID authority when you chop throttle, so a flip at zero throttle still has motors that can speed up and slow down around idle. Without it, zero throttle is "all motors at idle" and you are a brick with a camera.',
    ],
    lab: [
      'TPA in pid.c, modes PD or D. Anti-gravity is a feature flag plus gain, cutoff Hz, P gain; mixTable updates the throttle filter that drives it. Airmode is a feature flag plus airmode_start_throttle_percent. Mixer applies PID at min throttle when pid_at_min_throttle is on, which airmode needs.',
      'Features AIRMODE and ANTI_GRAVITY are LIVE CLI feature lines, not valueTable keys.',
    ],
    sim: [
      'Turn airmode off and fly a flip at zero throttle if you want to feel why it exists. Do it over grass. The plant will happily let you.',
    ],
    related: ['control-mixer', 'cli-tpa_rate', 'cli-anti_gravity_gain', 'cli-airmode_start_throttle_percent'],
    source: 'flight/pid.c, flight/mixer.c, catalog.js FEATURES',
  }),

  page({
    id: 'control-mixer',
    chapter: 'control',
    title: 'Mixer, idle, dyn idle, launch',
    kicker: 'The controller',
    lede: 'The mixer is where PID sums become four duties. Idle is the floor. Dynamic idle is a governor on that floor. Launch control is a start-line clutch.',
    figure: 'mixer',
    air: [
      'Mixer type LEGACY is the classic add-up. LINEAR and DYNAMIC change how throttle and PID share the motor range, especially when you are asking for more than 100 percent on one corner. EZLANDING is a landing helper, not a race default.',
      'DShot idle is a few percent of motor range so the bells never stall in airmode. Too low and yaw disappears at the bottom. Too high and you cannot descend. Dynamic idle watches RPM and raises the floor if a motor would droop, which protects desyncs on a real ESC. Here the plant cannot desync in the ESC sense, but the RPM loop still runs because the plant feeds rotor Hz.',
      'Launch control holds attitude at idle until you punch through a throttle trigger. L on the start line in this sim. It is a race toy and a first-flight friend.',
    ],
    lab: [
      'mixTable in mixer.c, compiled. dshot_idle_value is the digital idle offset. dyn_idle_* writes the PID profile and mixer_init; getMotorFrequencyHz is the telemetry. Launch control state machine lives in bf_glue.c because fc/core.c is not compiled; the PID profile fields are still the real ones.',
      'yaw_motors_reversed flips the mixer yaw sign. crashflip_* is stored but isFlipOverAfterCrashActive is stubbed false.',
    ],
    sim: [
      'motor_output_limit is LIVE and is a percentage cap on motor range, a cousin of throttle_limit that lives in the PID profile. Use one on purpose, not both by accident.',
    ],
    related: ['physics-yaw', 'cli-dshot_idle_value', 'cli-mixer_type', 'cli-dyn_idle_min_rpm'],
    source: 'flight/mixer.c, bf_glue.c launch control, bf_settings.c',
  }),

  page({
    id: 'control-simplified',
    chapter: 'control',
    title: 'Simplified sliders',
    kicker: 'The controller',
    lede: 'The sliders are not a second PID. They write the real gains through Betaflight\'s own simplified_tuning.c. Race presets are authored that way.',
    air: [
      'Master, P, I, D, D Max, feedforward, pitch relative to roll: these sliders exist so a human can move a tune as a shape instead of twelve numbers. The firmware then fills p_roll and friends. If you edit both, the last apply wins, and dumps that say simplified_tuning apply will overwrite your typed gains.',
      'Filter sliders similarly rewrite gyro and D-term Hz. Turn the simplified filter switch off if you want typed Hz to stick.',
    ],
    lab: [
      'simplified_pids_mode OFF / RP / RPY. applySimplifiedTuning is compiled. Karate-style presets in configs/ depend on this path. Without it they would load as comments and fly on defaults.',
    ],
    sim: [
      'LIVE. If a preset feels like defaults, the apply line was swallowed. That was a historical bug in the settings table. It is why bf_settings.c exists as a table rather than a chain of string compares that returned OK on unknown keys.',
    ],
    related: ['control-pid', 'cli-simplified_master_multiplier', 'start-compiled'],
    source: 'config/simplified_tuning.c, configs/, bf_settings.c history comment',
  }),

  page({
    id: 'control-angle',
    chapter: 'control',
    title: 'Angle mode and self-levelling',
    kicker: 'The controller',
    lede: 'Acro is rates. Angle is "the stick is a tilt." Keyboard flight raises angle because a key cannot be a good rate stick.',
    air: [
      'In angle, pushing pitch asks for a nose-up attitude, not a flip. Release and the craft levels. It is how most people survive a first hover. It is also how you learn bad habits for racing. Horizon mode, which blends the two, is stored here but never raised. There is no half-self-level in this shell.',
      'Launch control and angle can coexist on a start line. Race laps are acro.',
    ],
    lab: [
      'sim_set_angle_mode raises ANGLE_MODE. pidLevel reads angle_p_gain, angle_feedforward, angle_limit, angle_earth_ref, angle_feedforward_smoothing_ms from the plant quaternion via the IMU stub. horizon_* fields are APPLIED_INERT because HORIZON_MODE is never raised.',
      'level_race_mode is LIVE firmware that changes how angle uses yaw. Keyboard path in the shell forces angle regardless of Settings when the keyboard is the stick source.',
    ],
    sim: [
      'Settings Flight mode and the FC Modes tab are the same bit. There is no AUX channel. ARM is always on. You cannot accidentally disarm mid-air because there is no disarm.',
    ],
    related: ['cli-angle_p_gain', 'cli-horizon_level_strength', 'start-nowings'],
    source: 'bf_glue.c ANGLE_MODE, catalog.js horizon APPLIED_INERT',
  }),
];

export const ARTICLE_BY_ID = new Map(ARTICLES.map((a) => [a.id, a]));

export function articlesIn(chapter) {
  return ARTICLES.filter((a) => a.chapter === chapter);
}
