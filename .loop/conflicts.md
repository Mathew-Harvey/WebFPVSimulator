# Conflicts

Conflict 1: Gate P4 t80 wants TWR at least 14 or terminal under 27.
Gate P4 TWR caps at 12. Harness check 7 wants terminal at least 30.
Resolution: no third option exists inside honest physics; the bands are
mutually inconsistent (derivation in threshold-disputes.md entry 1).
The plant stays honest, P4 stays red on the t80 sub item, and the
dispute is routed to a human.

Conflict 3: Configurator ACTUAL rates labels. Round 2 showed CLI
`roll_rc_rate` next to 70 deg/s, which teaches a dump-flasher to write
`set roll_rc_rate = 70`. Round 3 labelled the row `roll centre` / `roll
max rate` and kept CLI export at 7 / 67. Round 4 Configurator review
wanted the CLI key back. Resolution: keep the r3 labels. Help on the
row still says `CLI is roll_rc_rate = 7`. Do not oscillate.


