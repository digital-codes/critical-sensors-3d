# Spec Delta

## ADDED Requirements

### Requirement: Blitz preset button

The view SHALL provide a "Blitz" preset button in the presets row (both
standalone and embed chrome) that sets the season day to the nearest
day-of-year configured as a lightning strike day (`CONFIG.SPARKS.STRIKE_DAYS`
within a month whose condition is `gewitter`) and switches the effective sky
condition to `gewitter`, so lightning strikes occur within the existing
scheduling behaviour.

#### Scenario: Button lands on a strike day with storm sky

-   **WHEN** the "Blitz" button is pressed from any day or sky state
- **THEN** the season day is set to the nearest configured strike day
  (currently day 232, labelled Aug 21), the sky condition is `gewitter`, and a
  lightning strike occurs within the scheduler's normal first-strike window

#### Scenario: Button is reachable like other presets

- **WHEN** the presets row is shown
- **THEN** the "Blitz" preset appears alongside the existing preset buttons
  and can be activated by click/tap like them

### Requirement: Idle demo loop

The view SHALL automatically cycle through the camera presets when the user
is inactive: after more than 1 minute without user input, the loop SHALL
activate each preset in turn (including Katze follow and Vogelflug), keeping
each preset for about 20 seconds and not advancing before a running preset
animation (e.g. the ~42 s bird flight) has finished.

#### Scenario: Loop starts after idle timeout

- **WHEN** no user input occurs for more than 1 minute
- **THEN** the view begins cycling the presets automatically, starting with
  the first preset after the current view

#### Scenario: Dwell respects running animations

- **WHEN** the loop reaches a preset whose animation runs longer than 20 s
  (e.g. Vogelflug)
- **THEN** the preset stays active until the animation completes and the
  remaining dwell (~20 s) has elapsed before advancing

### Requirement: Idle loop stops on user input

Any user input (pointer, touch, keyboard, preset or control interaction)
SHALL immediately stop the idle loop and reset its idle timer, and the view
SHALL return to the start view at the Tafel preset.

#### Scenario: Input interrupts the loop

- **WHEN** the user touches, moves or clicks anything while the loop is
  cycling
- **THEN** the loop stops immediately and the camera flies to the Tafel
  preset

#### Scenario: Idle timer resets on input

- **WHEN** any user input occurs at any time
- **THEN** the idle timer restarts from zero, so the loop only begins again
  after another full idle period
