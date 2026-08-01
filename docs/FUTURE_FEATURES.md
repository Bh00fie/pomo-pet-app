# Future Features (post-MVP)

Parked ideas from planning discussions — not in scope until MVP has shipped and we have real usage signal.

## v1.5 — cheap additions once MVP is live

- **Game Center leaderboards** for streaks/focus-hours (free, built into iOS, no custom backend needed —
  much cheaper than building real regional leaderboards)
- **Task tagging** — attach a session to a task/subject, see time-per-task breakdown
- **Home screen widget** — shows pet growth + today's progress
- **Achievements/badges** — first 10hrs, 7-day streak, night owl, etc.
- **Currency system separate from fish** — coins earned per minute focused, spent on cosmetics only

## v2+ — bigger investment, only if there's traction

- **Custom backend + true regional leaderboards** — needs server, DB, auth, and anti-cheat
  (a locally-reported streak is trivially fakeable without server validation)
- **Apple Watch companion app** — start/stop sessions from the wrist
- **Apple Health integration** — correlate focus sessions with sleep/steps/etc. as a premium feature;
  requires a native HealthKit module (loses Expo Go simplicity, needs a custom dev client)
- **Social sharing** — shareable snapshot of your zoo/aquarium (organic virality loop)
- **Ambient soundscapes** — lo-fi/nature sound mixes during sessions, possible subscription tier
- **Android port** — Expo makes this comparatively easy once iOS is stable
- **Body-doubling / virtual co-working rooms** — see other people's live sessions (needs real-time backend)

## Alternate app concepts (backup pivots, not pursuing now)

- Task-scoped focus app with per-task analytics as the main hook (no gamification)
- Screen-time "detox" timer that blocks distracting apps during sessions
- Standalone ambient soundscape + focus subscription app
- Nicer Apple Health data viewer (harder to differentiate, HealthKit complexity — see notes above)
