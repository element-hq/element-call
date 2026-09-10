---
status: implement
blocked_from: null
title: Audio quick menu
owner: fkwp
signoff:
  eng: ok
  design: ok
  product: ok
experiment_ref: fkwp/feature/audio_quick_menu_exploration
base: 029622f07b44f58f8a84e7e167e5b66374479b63
repos: [element-call]
specs: []
supersedes: []
superseded_by: null
---

## Problem

- `MediaMuteAndSwitchButton` populates its menu from `audioInput.available$` only. On
  desktop, audio output is reachable only through `SettingsModal` → audio tab, which covers
  the call view; the footer's `audioOutputSwitcher$` is an earpiece/loudspeaker toggle that
  only materialises for controlled (mobile) devices.
- No input-level indicator exists anywhere in the app: a participant cannot tell whether the
  selected microphone captures sound without unmuting and asking another participant.
- `soundEffectVolume` is adjustable only in `SettingsModal`, which replaces the call view.
- `DeviceSelection` renders nothing when `available.size <= 1`, and `AudioOutput.available$`
  is emptied on Safari, so those users get no indication of where call audio is going.
- The in-call chevron is suppressed off desktop and in PiP via `disableDeviceSwitcher$`
  (`CallFooterViewModel`), while `createLobbyFooterViewModel` passes `constant(false)`; the
  two surfaces already disagree about when the menu exists.

## Decisions

- D1 — The level indicator captures from the microphone only while the menu is open, muted or
  not — bounds the capture and the microphone-in-use indicator to a deliberate user action
  while still answering "is my microphone working?" before unmuting.
- D2 — The menu appears both before joining and during a call — pre-join is where a device
  check matters most, in-call is where the settings detour costs most.
- D3 — Before joining, the full menu appears on every platform, including mobile; during a
  call it stays web/desktop only — the pre-join chevron already exists everywhere, so
  suppressing sections there would be new work for no user gain.
- D4 — Sound-effects volume appears in the menu and stays in settings, both reading and
  writing one stored value — no migration, and neither audience loses the control it knows.
- D5 — Where the audio output cannot be changed, the menu still shows the active output as a
  non-selectable row — knowing where audio goes is useful even when it cannot be redirected.
- D6 — The menu carries no disclosure that the microphone is sampled while muted — mute state
  and the operating system's microphone-in-use indicator are independent of each other.
- D7 — A microphone producing no signal shows an idle indicator; one held exclusively by
  another application shows a greyed-out indicator — two distinguishable states, the second
  rare on current operating systems.
- D8 — A denied microphone permission shows a hint rather than a silent idle indicator —
  silence is otherwise indistinguishable from a broken microphone.
- D9 — The level indicator is focusable and announces its state to a screen reader while
  focused — it is the one control in the menu with no non-visual equivalent.
- D10 — No numeric latency target for the level indicator; it must move visibly while the
  person is still speaking — perceived latency is not critical for a presence check.
- D11 — Only the device lists scroll; the menu's heading and the sound-effect slider stay
  in place — a list longer than the screen otherwise carries both out of view.
- D12 — The level indicator belongs to the microphone group and stays visible while that
  group is on screen, rather than sitting with the output controls — pinned next to the
  sound-effect slider it reads as one of them.
- D13 — Keyboard navigation marks the current item with a border, pointer use marks it with
  a background and no border — the menu moves focus to whatever the pointer is over, so
  without the distinction both appear at once.

## Acceptance criteria

Test names are the anchor; tests are created with exactly these names.

- AC1 [FR-001] — The chevron beside the microphone button opens a menu headed "Audio controls".
  - check: `pnpm vitest run --project=unit -t "audio menu is headed Audio controls"`
- AC2 [FR-002] — The menu lists every available microphone, marks the active one, and selecting
  another switches input without closing the menu.
  - check: `pnpm vitest run --project=unit -t "audio menu switches microphone and stays open"`
- AC3 [FR-003] — The menu lists every available audio output, marks the active one, and
  selecting another switches output without closing the menu.
  - check: `pnpm vitest run --project=unit -t "audio menu switches audio output and stays open"`
- AC4 [FR-004] — The menu renders a separator between the microphone, speaker and
  sound-effects groups.
  - check: `pnpm vitest run --project=unit -t "audio menu separates microphone speaker and sound effects groups"`
- AC5 [FR-005] — With exactly one audio output available, the speaker group still names the
  active output and offers no selectable row.
  - check: `pnpm vitest run --project=unit -t "audio menu shows single audio output as non-selectable"`
- AC6 [FR-005] — In a browser that does not permit choosing an audio output, the speaker group
  names the active output and offers no selectable row.
  - check: manual, on Safari: join a call, open the microphone chevron, confirm the speaker
    group names the output in use and that no row responds to a click.
- AC7 [FR-006] — An output selected in the menu is shown as active in settings, and an output
  selected in settings is shown as active in the menu.
  - check: `pnpm vitest run --project=unit -t "audio output selection is shared between menu and settings"`
- AC8 [FR-007] — While the menu is open, the level indicator's reported level follows the
  signal level of the selected microphone.
  - check: `pnpm vitest run --project=unit -t "level indicator follows the microphone signal level"`
- AC9 [FR-008] — The level indicator responds to the microphone signal while the participant
  is muted.
  - check: `pnpm vitest run --project=unit -t "level indicator responds while muted"`
- AC10 [FR-009] — Opening the menu starts capturing from the selected microphone; closing it
  stops the capture.
  - check: `pnpm vitest run --project=unit -t "audio menu starts capture on open and stops on close"`
- AC11 [internal] — No microphone capture started by the menu outlives the menu, including
  when the menu is closed while a device switch is in flight.
  - check: `pnpm vitest run --project=unit -t "menu capture is released when closed during a device switch"`
- AC12 [FR-010] — Selecting a different microphone re-points the level indicator at it without
  closing the menu.
  - check: `pnpm vitest run --project=unit -t "level indicator follows a microphone change"`
- AC13 [FR-011] — A selected microphone that produces no signal leaves the indicator in its
  idle state and produces no error.
  - check: `pnpm vitest run --project=unit -t "level indicator stays idle for a silent microphone"`
- AC14 [FR-018] — With microphone permission denied, the menu shows a hint in place of the
  idle indicator.
  - check: `pnpm vitest run --project=unit -t "audio menu hints when microphone permission is denied"`
- AC15 [D7] — When the selected microphone cannot be opened because another application holds
  it, the indicator renders in a greyed-out state.
  - check: `pnpm vitest run --project=unit -t "level indicator greys out when the microphone is unavailable"`
- AC16 [FR-012] — Moving the sound-effects slider changes the level at which the next sound
  effect plays.
  - check: `pnpm vitest run --project=unit -t "sound effects volume from the menu applies to the next effect"`
- AC17 [FR-013] — Sound-effects volume set in the menu is shown in settings and vice versa.
  - check: `pnpm vitest run --project=unit -t "sound effects volume is shared between menu and settings"`
- AC18 [FR-014] — The full menu is present before joining on every platform, and during a call
  on web and desktop.
  - check: `pnpm vitest run --project=unit -t "audio menu is present pre-join on every platform"`
- AC19 [FR-015] — During a call on mobile, the microphone chevron offers no menu.
  - check: `pnpm test:playwright --project=mobile -g "no audio menu during a call on mobile"`
- AC20 [FR-016] — Every control in the menu — device rows, level indicator and sound-effects
  slider — is reachable and operable from the keyboard alone.
  - check: `pnpm vitest run --project=unit -t "audio menu is fully operable from the keyboard"`
- AC21 [FR-017] — The level indicator takes focus and announces its current state to a screen
  reader while focused.
  - check: manual, with VoiceOver active: open the menu, tab to the level indicator, speak,
    confirm the announced state changes with the signal.
- AC22 [D11] — With more devices than fit on screen, the heading and the sound-effect slider
  stay visible while the device lists scroll.
  - check: `pnpm vitest run --project=unit -t "audio menu keeps its title and volume slider out of the scrolling area"`
- AC23 [D12] — The level indicator stays with the microphone list and never sits among the
  output controls.
  - check: `pnpm vitest run --project=unit -t "level indicator stays with the microphone list rather than the speakers"`
- AC24 [D13] — Moving through the menu by keyboard marks the current item with a border;
  moving over it with a pointer marks it with a background and no border.
  - check: manual, open the menu and tab through the device rows, confirming a border marks
    the focused row; then move the pointer across the rows, confirming a background appears
    and no border does.
- AC25 [SC-001] — Selecting an output from the menu during a call leaves the other
  participants visible throughout.
  - check: `pnpm test:playwright --project=chromium -g "audio menu leaves participants visible while switching output"`
- AC26 [SC-002] — In a real browser with the menu open, sound at the microphone moves the
  level indicator.
  - check: `pnpm test:playwright --project=chromium --project=firefox -g "level indicator moves with microphone input"`
- AC27 [SC-003] — Every menu control is reachable and operable by keyboard alone in
  Chromium and Firefox.
  - check: `pnpm test:playwright --project=chromium --project=firefox -g "audio menu is keyboard operable in a real browser"`

## Rejected alternatives

- Driving the level meter from the microphone track the call already publishes — the
  track is muted exactly when the user is muted, so the meter reads flat in the one
  situation it exists for (D1, FR-008). A capture of its own is what makes a muted
  check possible.
- Gating the audio menu on there being more than one microphone, as the chevron did
  before — leaves no menu at all where there are no input devices to list but an
  output section is still worth showing, which is the pre-join case on iOS (D3).
- Naming the sound-effects slider with `aria-label` — the shared slider takes its
  accessible name from its tooltip, so the label was overridden and the control
  announced itself as "50%". The tooltip text now carries the control's name.
- Bounding the height of the menu as a whole — keeps it on screen, but scrolls the
  heading away with the device list, which is what the bound was meant to prevent (D11).
- Pinning the level meter beside the sound-effect slider — always visible, but read as
  one of the output controls rather than as a reading of the microphone (D12).
- Letting the level meter scroll with the microphone list — on a machine with many
  devices it is off screen for most of the interaction (D12).
- Fixed-width meter bars spread across the row — all leftover width lands in the gaps,
  so the bars read as thin lines separated by wide spaces. The bars share the row
  instead, and the gap and bar count together set their thickness.

## Measurements

- Unit suite: ≥ 771 passing, 0 failing, ≥ 98 files (method: `pnpm vitest run --project=unit`
  on the experiment branch rebased onto `base`, 2026-09-10; measured 771 / 0 / 98, 9 skipped).
- SC-001: holds (method: manual, owner, 2026-09-10 — output switched from the microphone
  chevron menu during a call; the other participants stayed visible throughout).
- SC-002: holds (method: manual, owner, 2026-09-10 — menu open, speaking, muted and
  unmuted; the level indicator moved while still speaking).
- SC-003: holds (method: manual, owner, 2026-09-10 — every menu control reached and
  operated by keyboard alone on the supported desktop browsers).
- Not measured: what the meter's second concurrent capture costs alongside the call's own
  — CPU of the second capture, analyser and per-frame poll during a call, and any glitch
  on the call's own track when the capture opens or closes.

## Out of scope

- The in-call chevron on mobile (`platform` `android` / `ios`), which stays suppressed by
  `disableDeviceSwitcher$` — FR-015. The lobby chevron is in scope on every platform
  (FR-014), so whatever `audioOutput.available$` reports there — including the
  speaker/earpiece entries of `AndroidControlledAudioOutput` / `IOSControlledAudioOutput` —
  is rendered by the same menu.
- The iOS native audio-device picker button (`showNativeAudioDevicePicker`); it stays in
  `SettingsModal`.
- The camera chevron menu and the background-blur toggle it carries.
- PiP layout; the menu stays suppressed there.
- An output test tone or "play test sound" affordance.
- Noise suppression, echo cancellation and gain controls.
- Restructuring the settings dialog beyond keeping the sound-effects slider in place.

## Open questions

None.

## Slicing plan

Re-derived 2026-09-10 against head 029622f (see Drift log). Owner decision 2026-09-10: the
feature lands as one PR into `fkwp/feature/audio_quick_menu`, one commit per slice, each
commit building and passing the unit suite on its own. Order follows story priority: US1
(P1) first, US2 (P2) second, US3 (P3) third; FR-014's pre-join surface last. Both footers
read one `MediaDevices` helper, so slice 1 lights the menu up on either surface and slice 5
is what holds it there.

1. Audio menu: "Audio controls" heading, microphone and speaker groups, active output as
   a non-selectable row where it cannot be changed, outputs derived in
   `CallFooterViewModel` — covers AC1, AC2, AC3, AC5, AC6, AC7, AC25 — depends on: none
2. Level meter component and its capture hook, unused until slice 3 — covers AC8, AC11,
   AC13, AC15 — depends on: none
3. Level meter in the microphone group: capture bound to the menu being open, placement
   with the microphone list, keyboard and pointer focus states — covers AC9, AC10, AC12,
   AC14, AC23, AC24, AC26 — depends on: 1, 2
4. Sound-effects volume in the menu, with only the device lists scrolling — covers AC4,
   AC16, AC17, AC20, AC21, AC22, AC27 — depends on: 3
5. Surface coverage: the menu reaches every platform before joining and stays gated to
   desktop during a call — covers AC18, AC19 — depends on: 4

## Drift log

### 2026-09-10 — drift check (base 029622f → head 029622f)
- `origin/main` is at `base`; `base..head` is empty. Every file and symbol named in
  `## Problem`, `## Measurements` and the provisional slicing plan exists unchanged; no
  decision is contradicted.
- AC check commands: vitest project `unit` and playwright projects `chromium`, `firefox`
  and `mobile` exist; every command runs.
- Slicing plan re-derived on size and story priority, not on drift: the provisional
  slice 2 (menu, speakers and meter, plus the `LobbyView` and `InCallView` snapshot
  churn) exceeds the 800-line hard stop, and the P1 story (output selection) did not
  lead. The pre-join surface moves to its own slice so the lobby snapshots change once.
- Implementation base: `fkwp/feature/audio_quick_menu` = head + the repo agent contract
  and the FEATURES_SPEC process, which are in review of their own. No source file differs
  from head. The slices and this spec ride on one branch that opens a PR against it.

### 2026-09-10 — owner decision: single PR
- The five slices land as one PR with one commit per slice, at roughly 2000 changed lines.
  Deviates from the 800-line hard stop in `FEATURES_SPEC/AGENTS.md` ("Turning a spec into
  PRs", step 3); accepted by the owner for a feature of this size. Review is per commit.
- The meter's capture cost stays unmeasured (see `## Measurements`): it needs a real-browser
  CPU profile during a call, which the implementation environment cannot produce.

### 2026-09-10 — implementation findings (head 029622f)
- The level meter reads zero on Firefox in CI, and neither the test device nor the code is
  the reason: Firefox's fake stream carries a 1 kHz tone at about a tenth of full scale,
  and the same test drives the meter to 0.62 against Firefox off the runner, including
  against the Docker image over plain HTTP that CI serves. The runner has no audio backend
  for Firefox. AC26 is therefore skipped there, a deviation from its check.
- Firefox starts an `AudioContext` suspended, which feeds the analyser silence until it
  resumes of its own accord seconds later. The capture is now resumed on creation, so the
  meter answers while the person is still speaking (D10).
- AC27 is skipped on Firefox too, a deviation from its check, because headless Firefox
  drives Tab unreliably, as `reconnect.spec.ts` records. AC25 skips Firefox, whose fake
  stream enumerates no audio outputs and so has nothing to switch; its check names only
  Chromium, so that is not a deviation.
- Keyboard reach: the Radix menu swallows Tab and walks only its own items with the arrow
  keys, so the meter and the slider were unreachable by keyboard alone. The audio menu
  keeps Tab from the menu so the browser's focus order reaches them (AC20, AC27); the
  exploration's keyboard test had only asserted that the controls exist.
- Unit suite on the PR head: 99 files, 784 passing, 0 failing, 9 skipped (method:
  `pnpm vitest run --project=unit`, 2026-09-10). The ≥ 771 / ≥ 98 floor holds.

### 2026-09-10 — finding: menu taller than the viewport (AC22, D11)
- With many devices the menu overflowed the viewport and carried the heading off the top:
  its height bound applied to the content box, leaving the menu's own padding outside it.
  Fixed by bounding the border box. AC22's check runs in jsdom, which lays nothing out, so
  it passed throughout. The story `CallFooter › With Many Devices` now measures the layout
  in a browser with the device count fixed; owner to decide whether AC22's check names it.
  An e2e test cannot stand in for it, because how many devices overflow the menu depends on
  how many a browser invents: the e2e test "audio menu stays inside a short window" asserts
  only what holds at any device count.

### 2026-09-10 — upstream PRs for the base of this branch
- The repo agent contract and the FEATURES_SPEC process go to `main` on their own: #4256
  (`fkwp/agents-md`) and #4255 (`fkwp/features-spec-process`). `fkwp/feature/audio_quick_menu`
  carries both as if merged; rebasing it onto `main` after they land drops the duplicates.

### 2026-09-10 — finding: chevron menus leave the root in the component build
- Compound's `Menu` portals to `document.body`, and the component build rewrites every
  selector to match only `[data-element-call-root]` or its descendants. A menu opened there
  matches none of its own styles: no background, no border, no padding, and the audio menu's
  height bound is inert, so nothing holds a long device list inside the window. Measured in
  the component harness, which applies the same scoping the library build ships.
- Not introduced by this feature. The camera chevron menu, untouched here, is equally
  unstyled in that build, and no component test covers a menu, which is why it went unseen.
- Out of scope for this spec: the fix is to give the portal the root element as its
  container, which Compound does not expose today. Raised separately. The audio menu behaves
  as specified standalone and as a widget, which is where its acceptance criteria are checked.

## PRs

- #4254 — draft, one commit per slice — AC1–AC27 (AC6, AC21, AC24 manual by the reviewer;
  AC26, AC27 on Chromium only)
