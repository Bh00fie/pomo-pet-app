# Step-by-Step Plan to Ship the MVP

Status legend: [ ] not started · [~] in progress · [x] done

## 0. Accounts & prerequisites (you)

- [ ] Enroll in the Apple Developer Program ($99/yr), accept agreements in App Store Connect
- [ ] Create an App ID / bundle identifier for the app (placeholder until real name is chosen)
- [ ] Confirm Xcode is installed and up to date on the Mac

## 1. Local dev environment

- [ ] Install Node.js, Expo CLI, EAS CLI
- [ ] Confirm `xcodebuild` and simulators work locally
- [ ] Create an Expo (TypeScript) project scaffold — not started yet, planning-only phase

## 2. Core timer engine

- [ ] Work/break state machine with custom durations
- [ ] Background/foreground handling so sessions survive app backgrounding correctly
- [ ] Local notifications for session/break completion

## 3. Pet/zoo system

- [ ] Data model for species, growth stages, and fish counts
- [ ] Local persistence (AsyncStorage or SQLite)
- [ ] Session-complete → reward logic (earn currency/fish)

## 4. Merge mechanic

- [ ] UI + logic to combine N small fish into 1 bigger fish
- [ ] Visual feedback/animation for merges

## 5. Accountability & streaks

- [ ] Leave-early detection and pet penalty logic
- [ ] Daily streak tracking (local date-based, no server)

## 6. Stats

- [ ] Today's focus time, current streak, all-time total view

## 7. Monetization

- [ ] Integrate IAP (RevenueCat or native StoreKit via a library like `react-native-purchases`)
- [ ] Implement at least one purchasable species/biome unlock
- [ ] Test purchase flow in sandbox

## 8. Polish

- [ ] App icon, splash screen, onboarding flow
- [ ] Pass over core screens for visual consistency

## 9. Store readiness

- [ ] App Store Connect listing: screenshots, description, keywords
- [ ] Privacy policy page (required even for local-only data)
- [ ] Age rating questionnaire

## 10. Testing & submission

- [ ] EAS Build → TestFlight internal testing
- [ ] Fix issues found in testing
- [ ] Submit for App Store review
- [ ] Respond to any rejection feedback, resubmit if needed

## 11. Launch

- [ ] Monitor crash reports and reviews post-launch
- [ ] Decide which `FUTURE_FEATURES.md` item to tackle first based on real usage
