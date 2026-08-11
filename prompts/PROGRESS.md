# PROGRESS.md

State between loop runs. Append only. Newest entry at the bottom. Never rewrite history, including the parts where something went wrong, because that is the most useful part of this file.

---

## CURRENT STATE

Stage: 1
Loop: not started
Last `npm run verify`: never run
Checks passing: 0 of 13

---

## OPEN QUESTIONS

Anything the loop could not resolve on its own, or a threshold it believes is wrong. Write the argument, do not act on it. A human answers these between runs.

- (none yet)

---

## DECISIONS

Choices made during the build that are not already in CLAUDE.md. One line each, with the reason.

- (none yet)

---

## RUN LOG

Format per turn that changed code:

```
### <date time> | Loop <A or B> | turn <n>
Changed: <what>
Verify: <n> of 13 passing. Failing: <names with measured value vs band>
Wrong: <anything attempted and undone, and why it did not work>
```

- (empty)
