# Feature Specification: Audio quick menu

**Feature Branch**: `[not yet created]`
**Created**: 2026-09-09
**Feature Spec**: `2026-09_Audio_Quick_Menu.md`  <!-- status lives in the feature spec's frontmatter, not here -->
**Owner**: fkwp
**Source**: this file
**Input**: User description: "The chevron next to the mic button only offers microphone selection ('Mic Source'). Extend it into a combined audio quick-menu that also lets the user pick the speaker/output. Microphone check: the live, input-level meter that visibly reacts to the user's voice — so they immediately see the mic is active. For now this is web/desktop only (mobile is another story). Stretch: validate if it's possible to also place the sound effects volume in that new chevron menu."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose where the call is heard, without leaving the call (Priority: P1)

A participant realises the call is coming out of the laptop speakers instead of their headset. They open the chevron next to the microphone button, see a speaker section alongside the microphone section, pick their headset, and hear the difference immediately — the call view never goes away and the menu stays open so they can confirm the choice.

**Why this priority**: This is the change that removes a full detour through the settings dialog during a live call, and it is the reason the menu is being reshaped at all. It is valuable on its own, with no dependency on the level meter or the volume slider.

**Independent Test**: With two or more audio outputs attached, join a call, open the microphone chevron, and switch output. Audio follows the choice, and the same choice is visible in settings.

**Acceptance Scenarios**:

1. **Given** a participant in a call with two or more audio outputs available, **When** they open the microphone chevron, **Then** the menu shows a microphone section and a speaker section under one "Audio controls" heading, each marking the active device.
2. **Given** the menu is open, **When** the participant selects a different speaker, **Then** call audio moves to that device, the row is marked active, and the menu stays open.
3. **Given** the participant switched output from the menu, **When** they open settings, **Then** settings shows the same output as the active one.
4. **Given** a browser that does not permit choosing an audio output, or a machine with exactly one output, **When** the participant opens the menu, **Then** the speaker section still shows which output is in use, presented as information rather than a choice.

---

### User Story 2 - Confirm the microphone is picking me up (Priority: P2)

Before speaking — or after being told "we can't hear you" — a participant opens the same menu and speaks. A level indicator next to the microphone section moves with their voice, so they can tell within a second whether the selected microphone is live, and can try another one in the same menu if it is not.

**Why this priority**: It answers the single most common audio complaint, but the menu is useful without it, and it carries the largest open design and privacy questions.

**Independent Test**: Open the menu, speak, and watch the indicator move; select a different microphone in the same menu and confirm the indicator follows it.

**Acceptance Scenarios**:

1. **Given** the menu is open and the participant is unmuted, **When** they speak, **Then** the indicator visibly rises and falls with their voice.
2. **Given** the menu is open and the participant is muted, **When** they speak, **Then** the indicator still rises and falls, so they can verify the microphone before unmuting.
3. **Given** the indicator is live, **When** the participant closes the menu, **Then** the indicator stops capturing from the microphone.
4. **Given** the menu is open, **When** the participant selects a different microphone, **Then** the indicator follows the newly selected microphone and the menu stays open.
5. **Given** the selected microphone produces no signal, **When** the participant speaks, **Then** the indicator rests in an idle state rather than showing an error.

---

### User Story 3 - Adjust sound-effect volume without leaving the call (Priority: P3)

Join and leave chimes and reaction sounds are too loud during a call. The participant opens the audio menu and moves a sound-effects slider until the next chime sits where they want it.

**Why this priority**: A convenience placement of an existing setting. It is the smallest slice, it can be dropped without touching the other two, and the value it adds is discoverability rather than new capability.

**Independent Test**: Move the slider in the menu, trigger a sound effect, and confirm both the audible change and that settings shows the new value.

**Acceptance Scenarios**:

1. **Given** the menu is open, **When** the participant moves the sound-effects slider, **Then** the next sound effect plays at the new level.
2. **Given** the participant changed the level in the menu, **When** they open settings, **Then** the settings slider shows the same level, and changing it there is reflected back in the menu.

---

### Edge Cases

- The menu is opened while muted: the operating system's "microphone in use" indicator turns on even though the participant is muted. No disclosure in the menu is required — that indicator is expected to behave the same whether the participant is muted or not, and mute state and microphone sampling are independent of one another.
- The active microphone or speaker is unplugged while the menu is open — the menu must settle on a device that exists rather than showing a stale selection.
- No microphone is present at all: the menu says so where the level indicator would be. An indicator at rest is what a working but silent microphone shows, so the two must not look alike.
- Microphone permission has not been granted yet — most likely when the menu is opened in the lobby before joining.
- Another application or browser tab holds the microphone exclusively, so the level indicator receives no signal even though the device is fine. Rare on current operating systems, which share the microphone between applications; where it does happen, the indicator shows a greyed-out state.
- Sound-effects volume is set to zero: effects are silent but the rest of the call audio is unaffected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The audio quick menu MUST be opened from the chevron next to the microphone button and MUST present its controls under a single "Audio controls" heading.
- **FR-002**: The menu MUST list the available microphones, mark the active one, and switch input immediately on selection while staying open.
- **FR-003**: The menu MUST list the available audio outputs, mark the active one, and switch output immediately on selection while staying open.
- **FR-004**: The microphone, speaker and sound-effects controls MUST be visually separated from one another within the menu.
- **FR-005**: When the audio output cannot be changed — the browser does not permit choosing an output, or only one output exists — the menu MUST still show the active output as a non-selectable row.
- **FR-006**: The output selected in the menu and the output selected in settings MUST be one and the same selection; a change in either MUST be reflected in the other.
- **FR-007**: The menu MUST show a live indicator of the sound level at the selected microphone.
- **FR-008**: The indicator MUST respond while the microphone is muted as well as while it is unmuted.
- **FR-009**: The indicator MUST become live when the menu opens and MUST stop capturing from the microphone when the menu closes.
- **FR-010**: Selecting a different microphone MUST re-point the indicator at that microphone without closing the menu.
- **FR-011**: When the selected microphone produces no signal, the indicator MUST show an idle state rather than an error.
- **FR-012**: Users MUST be able to change the sound-effects volume from the menu, taking effect from the next sound effect onward.
- **FR-013**: Sound-effects volume MUST remain adjustable in settings, and both controls MUST read and write the same stored value.
- **FR-014**: The menu MUST be available before joining and during a call on web and desktop, and before joining on every platform — the pre-join chevron already exists everywhere and MUST show the full menu.
- **FR-015**: During a call on mobile, the microphone chevron MUST behave as it does today; the menu is not introduced there.
- **FR-016**: Every control in the menu MUST be reachable and operable by keyboard alone.
- **FR-017**: The level indicator MUST be focusable, and while it holds focus it MUST announce its current state to a screen reader.
- **FR-018**: When microphone permission has been denied, the menu MUST show a hint saying so, in place of a silent idle indicator.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Changing the audio output never requires opening a dialog that covers the call: the other participants remain visible from the moment the participant reaches for the control until the new output is in use.
- **SC-002**: With the menu open, speech produces visible movement in the level indicator while the person is still speaking. No millisecond target: perceived latency is explicitly not critical for this indicator.
- **SC-003**: Every control in the menu, including the sound-effects slider, is reachable and operable with the keyboard alone, verified on the supported desktop browsers.
