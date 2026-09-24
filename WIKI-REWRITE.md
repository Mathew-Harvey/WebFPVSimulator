# FPV wiki rewrite: a voice sample

This file shows four wiki pages rewritten in the voice of a Year 10 physics textbook. The source text is the wiki as it was when it last lived in the simulator repository (commit `18e086f`, 26 August 2026). The live wiki is in `landingpage-WebFPVSimulator-` under `wiki/`. The session that wrote this file could not open that repository, because the permission check refused to attach it, so the live pages may differ from these. Every fact on the four pages was checked against the simulator code as it was on 24 September 2026, and the notes under each page list what was corrected.

## Status

Superseded. Later on 24 September 2026 the owner attached `landingpage-WebFPVSimulator-` with push access, and the whole live wiki was rewritten in this voice there (commits `d12c8e6` and `4d125d8` on its main). Its `docs/wiki-voice.md` is now the style contract and `docs/wiki-textbook-2026-09.md` records the pass. This file stays as the record of the first proposal, and it is out of date in these ways:

- The first article section became The idea, not What the pilot notices, because one label has to fit all 36 pages.
- The sample's closed loop page says dropping a Betaflight diff file onto the page loads it. That is no longer true: the drop handler in `src/main.js` only says the page does not fly a dropped file any more.
- The list of stale facts under "What is left" missed two: the five inch weighs 0.71 kg, not the 650 g the August text says, and the Weight slider scales gravity (1.62 times Earth gravity on the five inch at its normal setting). The live wiki uses those numbers.

The original status, for the record: nothing had been applied to the live wiki, because the landing page repository could not be attached, and the owner had not yet answered on the voice or the structure changes below.

## Rules applied

- Plain English for a Year 10 reader. Every technical term is defined in words the first time it appears on a page. Wiki paragraphs are plain text, so defined terms are not bolded.
- No analogies. Each thing is described as what it is. "P is now. I is memory. D is brakes." becomes a statement of what each term calculates.
- The humanizer patterns are removed: "not X but Y" contrasts that correct nobody, one-line closers, staged openers, forced groups of three, figurative labels and inflated words. There are no em or en dashes, as CLAUDE.md requires.
- Facts are kept, and each one is checked against the current code. Nothing is added that the code or the old page does not support. Paragraphs about earlier versions of the model are cut, because that history belongs in PROGRESS.md and the code comments (humanizer pattern 25).
- The maths stays at Year 10 level: ratios, squares, straight-line graphs and percentages. Every number the simulator uses keeps its unit. Detail that needs more maths than that is cut, or moved to "In this simulator".
- Setting names such as `p_roll` and file paths stay exactly as they are, because readers search for them.

## Structure changes these pages assume

Each of these is a small code change in the wiki, and each one is your decision.

| Now | Proposed | Reason |
|---|---|---|
| In the air / In the lab / In this simulator | What the pilot notices / How it works / In this simulator | "In the air" and "In the lab" are figures of speech. The new labels say what each section contains. |
| The journey / The plant / The controller / Every setting | Getting started / The physics / The flight controller / Settings reference | "Plant" is the control engineering word for the system being controlled. A Year 10 reader will not know it. |
| "the plant" in running text | "the physics model", with "plant" defined once on the first page | Same reason. |
| Raise / Lower, each with an air and a lab paragraph | If you raise it / If you lower it: what the pilot notices, then why | The two paragraphs stay. The headings say what they answer. |
| Status chips LIVE, GATED, APPLIED_INERT, INERT, ABSENT | Works here / Stored, switched off at 1 kHz / Stored, not used / Not simulated / Configurator only | The codes stay in the catalog. The chip shows words a reader can follow. |

---

## The closed loop

*Chapter: Getting started*

When you fly a quad, the sticks do not control the motors directly. They set a target: how fast the quad should rotate. A small computer on the quad, called the flight controller, measures how fast the quad is rotating and changes the power to the four motors to close the gap. A system that measures its own output and corrects it in this way is called a closed loop. The flight controller goes round this loop 1,000 times a second.

### What the pilot notices

When you move the roll stick, the radio in your hands sends a short digital message, called a packet, to a receiver on the quad. The flight controller reads the stick position from the packet and turns it into a target roll rate, in degrees per second, using a formula called the rates curve. It then reads the gyro, a sensor that measures how fast the quad is rotating. The target rate minus the measured rate is called the error. A calculation called PID turns the error into a power level for each of the four motors. The motors change speed, the propellers change thrust, the quad rotates, the gyro measures the new rate, and the error gets smaller. Then the cycle starts again.

If the frame vibrates, the gyro measures the vibration along with the rotation, and the flight controller corrects for movement that is not really happening. The thrust also takes time to change. The spinning motor and propeller have mass, so they take time to speed up. The battery voltage falls when a large current is drawn, which is called sag, and this leaves less power for the motors. The propellers give less thrust when air is already moving through them (see Advance ratio). Each of these delays the thrust the flight controller asked for, so the correction arrives late and the quad rotates past its target before it settles. This is called overshoot. If you ask for a faster rotation than the quad can produce, some motors reach full power, and the quad rotates only as fast as those motors can turn it.

Betaflight, the flight controller software, also uses feedforward. Feedforward measures how fast the stick is moving and changes the motor power straight away, before any error has built up. It is smoothest when stick positions arrive at regular times. On a real radio link the packets arrive at slightly uneven times, and this makes feedforward less smooth. A simulated link with perfectly even timing would make feedforward smoother than any real radio can, so the simulator has a radio model that adds the delays and uneven timing of a real link. You can turn it on with the Radio link setting.

### How it works

The simulator runs one step of the loop every millisecond (0.001 s), in the same order that Betaflight uses on a real flight controller. First, it reads the gyro. The simulated gyro takes the quad's true rotation rate from the physics model, adds simulated vibration (in the Expert flight style), and rounds the result in the same way as a real 16-bit gyro chip that measures up to 2,000 degrees per second in either direction. Next, Betaflight's gyro filters remove as much of the vibration as they can. If a new radio packet has arrived, Betaflight reads the new stick positions, and on every step it turns the latest positions into target rates. The PID controller then compares the target rates with the filtered gyro rates and calculates a correction for each axis. Last, the mixer combines the corrections with the throttle to give a power level for each motor.

The power level is a duty cycle: the fraction of the time that the motor's speed controller connects the motor to the battery. The four duty cycles go to the physics model, which works out the motor speeds, the forces on the quad, and how it moves during the next millisecond. Two Betaflight features, dynamic idle and the RPM filter, need to know how fast each motor is spinning. On a real quad the speed controllers report this back to the flight controller after a short delay. The simulator passes Betaflight the motor speeds from the physics model with the same kind of delay.

Betaflight works in degrees per second. The physics model uses radians per second, which is the SI unit (1 radian per second is about 57.3 degrees per second). The code that connects the two, called the glue, converts between them. Two features that depend on the throttle, TPA and anti-gravity, take their throttle value from the mixer. The mixer runs after the PID, so the PID always uses the throttle value from the step before. Real hardware runs in the same order.

Each stick reading carries the time at which it was taken. The simulator applies each reading at the start of the millisecond step that contains that time. The moment the reading happened to reach the computer does not matter. If readings were applied when they arrived, the uneven timing of the computer would reach the physics, and the quad would feel "floaty" to pilots.

### In this simulator

When you press Save on the firmware bench (on the Quad screen), the simulator writes your settings out as Betaflight command line (CLI) text and restarts Betaflight with it. This resets the quad. It is the same path the simulator uses when you drop a real Betaflight diff file onto the page. No menu sets a PID gain itself: every gain reaches the loop through Betaflight's own settings. Settings marked LIVE reach Betaflight 4.5.1 code that is compiled into the simulator and runs. Settings that have no effect here are shown in grey, with the reason.

*Related: The PID controller, Gyro vibration, The radio link, Filters. Source: `src/native/bf/bf_glue.c`, `src/native/sim.c`.*

> Notes on this page:
> - Removed: "You do not fly motors. You fly a rate loop that flies motors.", "the loop fights ghosts", "the cheat code that is not a cheat", "that conversation happens a thousand times a second", "what the sticker said".
> - Defined on first use: flight controller, closed loop, packet, rates curve, gyro, error, overshoot, sag, duty cycle, glue.
> - Updated to today's code: the flight controller screen is now the firmware bench on the Quad screen, Save resets the quad, and the radio model is the Radio link setting. The loop order in `bf_glue.c` is unchanged.
> - Cut: the history of the stale throttle bug. It stays in the `bf_glue.c` comment.

---

## Vortex ring state

*Chapter: The physics*

When a quad descends into the air its own propellers have just pushed down, that air starts to circulate around the propellers in a ring. The propellers lose thrust, the quad sinks faster, and the sticks have less effect. Pilots call the worst of this "falling through".

### What the pilot notices

Helicopters are known for this effect, and a quadcopter has it on each of its four propellers. A slow descent causes no trouble. Air flows up through the propellers from below, and they make slightly more thrust than they do in a hover. At a faster descent this steady flow breaks down. Some of the air the propellers have pushed down flows back up around the outside of each propeller and is pushed down through it again, forming a ring of circulating air. The propellers lose thrust, and the pilot loses control authority, which means the sticks have less effect than usual.

The motors can sound as if they are working normally, or even speed up. In a descent, the air flowing up through each propeller makes it easier to turn, so at the same throttle the motor spins faster.

The way out is the same as for a helicopter: stop descending into your own downwash. Pitch or roll so that the quad moves sideways into air that has not been pushed down, and add power once the propellers are in that clean air. If you drop straight down with the propellers level, expect control to become weak partway through the fall.

### How it works

A propeller makes thrust by pushing air down. Every propeller has a pitch: the distance its blades would move along its axis in one full turn if they moved exactly in the direction the blade angle points. Pitch is the second number in a propeller's size. The 5 inch quad in this simulator uses 5×4.3×3 propellers: 5 inches across, a pitch of 4.3 inches (10.9 cm), and three blades. The pitch speed is the pitch multiplied by the number of turns the propeller makes each second.

The simulator describes a climb or a descent with one number, the axial advance ratio, written μ (the Greek letter mu). It is the speed at which the propeller moves through the air along its own axis, divided by its pitch speed. Moving up gives a positive μ, and moving down gives a negative μ. In a descent, the simulator uses three ranges of μ.

From 0 to −0.30, the descent is shallow. The upward air helps the propeller, and thrust rises in a straight line as the descent gets faster, up to 1.30 times the thrust the same propeller speed gives in a hover.

From −0.30 to −1.20, the propeller is in the vortex ring state. Thrust falls in a straight line from 1.30 times the hover value to 0.75 times.

Beyond −1.20, thrust stays at 0.75 times the hover value.

This shape matches the range of descent speeds where momentum theory, the simple model of a propeller used elsewhere in the simulator, stops giving valid answers. It was not fitted to make the quad feel a particular way.

On a real quad the four propellers do not lose thrust together, because each one sits in a different part of the air moving around the other three and around the frame. The simulator makes each propeller's loss slightly different, by up to about 3 percent, which is about how much one propeller differs from another on a real quad. The four differences add up to zero. Without them, all four propellers would lose exactly the same thrust, and the quad would lose height with no other disturbance, which is not what pilots feel on a real quad.

### In this simulator

This page covers the average loss of thrust. The shaking that comes with it is called propwash and has its own page. Propwash is switched on only in a descent into the downwash. The simulator's automatic flight tests (checks 5 to 12) were measured with this thrust loss in place, and propwash does not change their results.

In the Arcade flight style, the differences between the four propellers and the propwash shaking are turned off. The average loss of thrust is the same in Arcade and Expert.

The motor load also follows the airflow, which is why the motors speed up in a descent (see Thrust, torque and figure of merit).

The values are set in `src/native/plant.c`. The loss starts at μ = −0.30, is complete at μ = −1.20, and leaves 75 percent of the thrust. Of the four propellers, one loses 3.1 percent less than the average, one 1.7 percent more, one 2.8 percent more and one 1.4 percent less.

*Related: Propwash, Advance ratio and pitch speed, Translational lift. Source: `src/native/plant.c`, the descent branch of the motor loop, `PLANT_VRS_*` and `PLANT_INFLOW_ASYM`.*

> Notes on this page:
> - Removed: "the disc can start eating a doughnut of its own wake", "the ugly edge of this".
> - Added from today's code: the motors speed up in a descent, because prop torque now follows the airflow, and Arcade turns off the per-propeller differences. Neither is in the August text.
> - Cut: the paragraph about the earlier model that gave more thrust the faster the quad fell. It stays in the `plant.c` comment.
> - Left out on purpose: the code comment calls the shallow descent "the windmill brake state", and a second comment (on `k_rotor_axial`) uses the same name for a broken-down wake. In rotor theory the name usually means the fast descent beyond the vortex ring state. The two comments disagree with each other, so the page does not use the term. The comments may be worth a look.

---

## The PID controller

*Chapter: The flight controller*

PID is the calculation the flight controller uses to turn the error into motor commands. The error is the difference between the rotation rate you asked for and the rate the gyro measures. PID has three parts, called P, I and D, and Betaflight adds a fourth, called F. In this simulator they all run in Betaflight's own compiled code. They use the gyro reading after filtering, and they never see the exact rotation rate from the physics model.

### What the pilot notices

P stands for proportional. P makes a correction in proportion to the error: twice the error gives twice the correction. With too little P the quad is slow to respond. With too much P it vibrates rapidly, and you hear a buzz from the motors.

I stands for integral. The I term adds up the error over time, so if a small error lasts, the I term keeps growing until the error is gone. A lasting error can come from the nose pitching up at high speed, or from a motor mounted at a slight angle. Wind is another cause on a real quad, but this simulator has no wind. With too little I, the quad slowly drifts away from where you point it. With too much I, the stored correction grows large and is then released suddenly, so the quad lurches. A feature called I-term relax stops the I term growing during a fast stick movement. Without it, a flip would store up a correction that pushes the quad on when you stop.

D stands for derivative. D responds to how fast the rotation rate is changing and acts against fast changes. This reduces overshoot, which is when the quad rotates past the point where you stopped the stick. D also magnifies vibration in the gyro signal, so it has its own filter. A feature called D max lets the quad use a lower D while hovering and a higher D when you move the stick quickly. In Betaflight 4.5 the lower value is still stored under the name `d_min`.

### How it works

On every step, the flight controller calculates an error for each axis (roll, pitch and yaw): the target rate, called the setpoint, minus the filtered gyro rate, in degrees per second.

The P term is the P gain multiplied by the error.

The I term is the I gain multiplied by a running total of the error from every step. Betaflight limits how large the total can grow. Two options change it further: I-term relax holds it back during fast stick movements, and I-term rotation moves the stored total between the roll and pitch axes as the quad yaws.

The D term is the D gain multiplied by how fast the filtered gyro rate is changing. It uses the gyro rate, not the error, so D reacts only to the quad's measured movement. Moving the stick changes the setpoint, and D does not react to that change directly.

The F term, feedforward, is calculated from how fast the setpoint is changing.

TPA (throttle PID attenuation) reduces P and D, or only D, as the throttle rises. Anti-gravity raises I, and can also raise P, when the throttle changes quickly, so that the quad does not tip in pitch or roll when you suddenly add power.

The gains are numbers in Betaflight's own units, not SI units, and each axis has its own values. On real 5 inch quads, yaw D is often low or zero. The yaw measurement is noisier, and the quad has a larger moment of inertia about the yaw axis, which means a larger turning effect is needed to change its yaw rate. A setting called `pidsum_limit` caps the sum of the terms before it reaches the mixer, so that one axis cannot use up the whole range of the motors.

### In this simulator

Every P, I, D and F setting works here (status LIVE). When you change one and save, the value is written into Betaflight's PID profile, and the flight controller restarts and flies with it. There is no PID written in JavaScript: the controller is Betaflight's own code. Betaflight's onboard blackbox recorder is not included. Instead, the Flight log setting records the whole flight in memory and saves it as a Betaflight blackbox CSV file.

*Related: Feedforward, Filters, TPA anti-gravity and airmode, P roll. Source: `vendor/betaflight/src/main/flight/pid.c`, `src/native/bf/bf_glue.c` (the `pidController` call).*

> Notes on this page:
> - Removed: "P is now. I is memory. D is brakes.", "the craft is lazy", "winds up, then lets go in a lurch".
> - Defined on first use: proportional, integral, derivative, setpoint, overshoot, moment of inertia, TPA.
> - Checked against today's code: the simulator still has no wind force, and the flight log is still a blackbox-format CSV, now under Settings, Diagnostics, Flight log.

---

## P roll

*Chapter: Settings reference. Setting: `p_roll`. Status: Works here (LIVE).*

P roll is the proportional gain for the roll axis. When the quad is rolling faster or slower than you asked, P changes the power to the left and right pairs of motors in proportion to the difference. It is the setting pilots usually mean when they call a quad "snappy" or "lazy".

### How it works

Betaflight's PID code calculates the roll P term as the P gain multiplied by the roll error: the target roll rate minus the filtered gyro roll rate. The gain is in Betaflight's own units, not SI units. The mixer applies the result to the motors, raising the power on one side and lowering it on the other. P has no memory of earlier errors, so a disturbance that lasts is corrected by the I term.

### In this simulator

This setting works here. It sets the roll P gain in Betaflight's PID profile. The physics model never reads it. It only receives the motor power levels that come out of the mixer.

### If you raise it

Roll starts sooner, and small left and right movements of the right stick feel more directly connected to the quad. Past a certain point the quad buzzes, especially when you add throttle quickly and the gyro vibration is strongest.

A higher P makes the loop correct errors faster and shortens the delay between the stick and the quad. It also magnifies any vibration that gets past the gyro filters, and the quad settles less smoothly after each movement, so D has to do more work to stop overshoot.

### If you lower it

Roll feels soft and late. You wait for the quad to respond, then move the stick too far.

A lower P takes longer to correct a roll rate error, and the I term builds up more in the meantime. Feedforward can hide a low P during stick movements, but the quad still recovers more slowly from a disturbance.

*Related: The PID controller, I roll, D roll, Feedforward roll.*

> Notes on this page:
> - One template writes P roll, P pitch and P yaw. The old template gave every axis the same examples, so the roll page mentioned the nose rising at speed (a pitch effect) and a note about yaw D. The rewrite gives each axis only the examples that apply to it.
> - The old "air" and "lab" paragraphs for raise and lower become two paragraphs under each heading: what the pilot notices, then why.

---

## What is left

The full rewrite is done in `landingpage-WebFPVSimulator-`, against the live wiki, and not against the August copy used here. Going by the August copy, it covers 35 articles, about 180 settings pages with their own text, the family templates that write the other 500 or so settings pages, the figure captions, and the wiki's labels. The live copy may be larger.

Rewording is half of the job. The August text is out of date as well as hard to read, so every claim has to be checked against this repository's code, which wins when the two disagree. These differences between the August text and the code were found on 24 September:

- It says the 5 inch is the only aircraft. The airframe table in `src/native/plant.c` now has a whoop as well.
- It says prop drag torque goes as RPM squared whatever the air is doing. Torque now follows the airflow, so a descent unloads the motors and they speed up.
- It says there is no ground effect. The whoop has ground effect. The 5 inch still has none (`k_ground` is 0).
- It quotes a figure of merit of 0.565. The 5 inch's `torque_ind` is now 0.520, and the airframe page and the thrust and torque page need checking against it.
- It uses old screen names. The flight controller screen is now the firmware bench on the Quad screen, rates are in Settings, and camera angle and field of view are on the Quad screen.
- It does not mention the Arcade flight style, which turns off propwash, gyro noise and build asymmetry.

The landing page repository's own checks (`lint:wiki`, `noun-lint`, `page-lint`) run after the rewrite, and the pages are looked at in a browser before they are called done.
