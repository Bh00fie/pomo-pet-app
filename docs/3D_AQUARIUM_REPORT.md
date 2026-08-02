# 3D Aquarium — Feasibility Report

**Branch:** `explore/3d-aquarium` (parallel spike — deliberately not merged, no PR opened)
**Date:** 2026-08-02
**Question:** Forest grows a 3D tree during a focus session. Should Pomo Pet render a real 3D
aquarium with 3D fish, instead of the 2D Skia procedural fish already specified in `PLAN.md` M2?
And can "buy a different tank shape" work as an IAP either way?

---

## Recommendation, up front

**Ship v1 on 2D Skia. Park 3D as a v2 candidate, not a v1 upgrade.**

Not because 3D doesn't work — it does, and better than expected. The two things that were most
likely to kill it both came back clean:

- **3D does *not* break the free Expo Go plan.** `expo-gl` is a bundled Expo Go module on SDK 54,
  so the whole M0–M6a free phase survives intact. This was the big open risk and it is resolved.
- **It builds today** on the exact stack this project is pinned to. There is a working prototype
  on this branch with three tank shapes and up to 40 fish.

The reason to defer is not technical feasibility. It is **the per-species art cost, which is
exactly where this app makes its money.**

The business model is selling fish species as IAP. In the 2D procedural design, a new species is
a *record*: body/tail/fin parameters and a colour ramp. You can author one in an afternoon and
ship five in a week, forever, at zero marginal cost. In 3D, a new species is a *modelled, UV-
unwrapped, textured, rigged asset*. That is days of work or real money to an artist, per SKU,
forever. Adopting 3D converts your cheapest, most repeatable revenue lever into your most
expensive one. For a solo developer that is the decisive fact, and it has nothing to do with
frame rates.

Three secondary costs reinforce it, in descending order of importance:

1. **Animation moves back onto the JS thread.** Skia + Reanimated animate on the UI thread via
   worklets; react-three-fiber's render loop is a JS-thread `requestAnimationFrame`. This app
   re-renders a timer every second while the tank is on screen. Under 2D, that re-render cannot
   touch the animation. Under 3D, it shares a thread with it.
2. **`expo-gl` is built on OpenGL ES, which Apple deprecated in 2018.** Skia on iOS is on Metal.
   See "The OpenGL question" below — this is a slow-moving risk, not an urgent one, but it points
   the wrong way for a codebase you intend to keep for years.
3. **+1.68 MB of JS bundle (+44%)**, measured, for three.js alone.

**What would change this answer:** if you decide the aquarium is the *product* rather than the
reward — i.e. you'd rather sell one gorgeous tank people show their friends than twenty cheap
species — then the art-cost argument inverts and 3D becomes the right call. That is a product
decision, not an engineering one, and it's yours. Revisit at the M6a gate, when you've used the
free build and know whether the tank is the thing you actually look at.

---

## What was actually built and verified

A real prototype, on this branch, running on the pinned SDK 54 stack:

| File | What it is |
|---|---|
| `src/features/aquarium3d/tanks.ts` | Tank SKUs as pure data — `box`, `bowl`, `cylinder` |
| `src/features/aquarium3d/swim.ts` | Closed-form swim paths + per-shape containment |
| `src/features/aquarium3d/Fish3D.tsx` | ~88-triangle primitive fish, animated tail beat |
| `src/features/aquarium3d/Tank.tsx` | Glass shell, substrate, rocks, branching coral |
| `src/features/aquarium3d/Aquarium3DScene.tsx` | Lights + camera + the `Canvas` |
| `src/features/aquarium3d/Aquarium3DScreen.tsx` | Harness — flip tank shape and fish count live |
| `app/(tabs)/tank3d.tsx` | Spike-only tab |

Versions resolved on SDK 54: `expo-gl@16.0.10`, `three@0.185.1`, `@react-three/fiber@9.7.0`,
`@types/three@0.185.3`.

**Verified from this machine:**

- `npx tsc --noEmit` — clean
- `npx expo-doctor` — 18/18 checks passed, with the 3D stack installed
- `npx expo export --platform ios` — succeeds; bundle sizes below
- `expo-gl@16.0.10` is listed in `node_modules/expo/bundledNativeModules.json`, and the SDK 54
  docs for `GLView` carry the "Included in Expo Go" badge

**Not verified, and I'm not going to pretend otherwise:** *nothing here has been run on a physical
iPhone.* This machine has Command Line Tools only — no Xcode, no Simulator — and even with a
Simulator it wouldn't settle it, because Three.js + EXGL is documented as unreliable on
simulators/emulators and needs a real device. So **every frame-rate, battery, and thermal number
in this report is an estimate derived from measured scene complexity and architecture, not a
benchmark.** The bundle sizes, triangle counts, draw-call counts and version resolutions *are*
measured. Treat those two categories differently.

To run it yourself:

```sh
git checkout explore/3d-aquarium
npm install
npx expo start          # scan with App Store Expo Go, open the "3D" tab
```

That is a 10-minute test and it converts most of this report's estimates into facts. It is worth
doing before you act on any of this.

---

## 1. Expo Go compatibility

This was the load-bearing question, because the entire M0–M6a plan is built to run for free in
App Store Expo Go, and losing that means paying $99 before you've decided you want the app.

| | 2D — Skia | 3D — expo-gl + three |
|---|---|---|
| Runs in App Store Expo Go (SDK 54) | Yes | **Yes** |
| Custom dev client required | No | **No** |
| Native modules used | `@shopify/react-native-skia` 2.2.12 | `expo-gl` 16.0.10 |
| Both bundled in Expo Go | Yes | Yes |
| New Architecture (Fabric) | Yes | Yes — `expo-gl` has been Fabric-capable since 15.0.1 |

**3D does not cost you Expo Go.** `expo-gl` is a first-party Expo module, version-managed for
SDK 54 and shipped inside the Expo Go binary. `@react-three/fiber/native` sits on top of it and
needs no native code of its own — its requirements (RN ≥ 0.78, Expo SDK ≥ 43, React ≥ 19) are all
satisfied by this project (RN 0.81.5, SDK 54, React 19.1.0).

Two stale warnings you will hit if you search this yourself, both now resolved:

- *"react-three-fiber pins `expo-gl@^11` and breaks on SDK 53"* — real at the time, fixed.
  `@react-three/fiber@9.7.0` declares `expo-gl: ">=11.0"`, and it installed against `expo-gl@16`
  here with no peer conflict.
- *"use `expo-three`"* — no longer necessary. `expo-three` (v8.0.0) exists for asset/loader
  plumbing; `@react-three/fiber/native` polyfills `TextureLoader`, `FileLoader`,
  `URL.createObjectURL` and `LoaderUtils` itself. The prototype does not depend on `expo-three`
  at all.

Also worth knowing while you're pinned to 54: as of the May 2026 Expo changelog, **SDK 54 is
still the App Store Expo Go version** — SDK 55's build is stuck in Apple review, and from SDK 56
onward Expo is steering people to `eas go` / TestFlight custom Expo Go builds instead. The `~54`
pin in `PLAN.md` is not just still correct, it has aged well.

### The OpenGL question

This is the one genuinely uncomfortable finding, and it is not in any of the blog posts — it came
from reading the shipped source.

`expo-gl@16.0.10`'s iOS implementation (`ios/EXGLContext.mm`, `ios/GLView.swift`) creates its
context with `EAGLContext(API: kEAGLRenderingAPIOpenGLES3)` and renders into a `CAEAGLLayer`.
That is raw OpenGL ES through Apple's EAGL API — **not** Metal, and **not** ANGLE-on-Metal.
Apple deprecated OpenGL ES in iOS 12 (2018).

By contrast, `@shopify/react-native-skia@2.2.12` renders through `MetalContext.mm` /
`RNSkMetalCanvasProvider.mm` — Metal, natively.

What this means in practice:

- It is **not** an urgent problem. Deprecated ≠ removed; OpenGL ES still works on current iOS and
  a large amount of shipped software depends on it.
- It **is** a directional risk. If you build your app's signature visual on `expo-gl`, you are
  betting on a deprecated Apple API staying alive, and on Expo porting `expo-gl` to Metal/ANGLE
  before Apple pulls it. That is a bet you don't have to make.
- It also caps what you can do. OpenGL ES on iOS won't get new capabilities, and `expo-gl` cannot
  expose WebGPU-class features through it.

For a hobby spike this is noise. For the visual centrepiece of an app you plan to maintain for
years and sell content inside, it belongs in the decision.

---

## 2. Performance and weight

### Bundle size — measured

Both numbers are the iOS Hermes bytecode bundle from `npx expo export --platform ios` on this
repo, same app, same screens, differing only by the 3D feature:

| Build | Bundle | Delta |
|---|---:|---:|
| 2D baseline (`main`, commit `c7fecd9`) | 3,807,137 B — **3.81 MB** | — |
| With 3D (`explore/3d-aquarium`, commit `87d6b4c`) | 5,490,906 B — **5.49 MB** | **+1.68 MB / +44%** |

That is three.js plus react-three-fiber, and it is close to a floor rather than a ceiling:

- Metro does not tree-shake three.js by default on SDK 54, so you ship a large slice of the
  library whether you use it or not.
- The prototype uses **zero** external assets. Real fish models, textures and normal maps land on
  top of this. A handful of modest glTF fish with 512px textures is realistically another
  2–6 MB of app payload.
- Skia's cost is already inside the 3.81 MB baseline, so this is a genuine apples-to-apples delta,
  not 2D-free-vs-3D-expensive.

### Scene complexity — measured

Computed directly from the prototype's geometry:

| | Per fish | 10 fish | 20 fish | 40 fish |
|---|---:|---:|---:|---:|
| Triangles | 88 | 880 | 1,760 | 3,520 |
| Draw calls | 4 | 40 | 80 | 160 |

Tank shells: box 12 triangles, cylinder 56, bowl 1,504.

The headline here is the second row, not the first. **Triangle count is irrelevant** — 3,520
triangles is nothing for any GPU shipped this decade. **Draw calls are the actual cost.** Each
fish is four separate meshes (body, tail, dorsal, eye), so 20 fish is ~80 draw calls plus the
tank, and three.js does not batch them automatically. Each one is JS-side work per frame.

The fix is standard and known: merge each fish into one mesh and use `InstancedMesh` with a
per-instance transform, taking 20 fish from ~80 draw calls to ~1–2. The tail beat then has to
move into a vertex shader (bend the mesh along its local X by a per-instance phase) rather than
being a rotated child object. That is genuinely the right way to build this — it's also a chunk
of work the 2D path simply doesn't have, and it's the kind of thing you discover *after*
committing.

### Runtime cost — estimated, not measured

Stated as reasoning so you can check it, and flagged clearly as estimate:

- **Frame rate.** The naive prototype (~80 draw calls, no instancing) should hold 60fps on a
  recent iPhone and land somewhere in the 30–50fps range on an iPhone 11-era device, dropping as
  fish count rises. Instanced, both should sit at 60fps comfortably. The published third-party
  data point — `expo-three` scenes running at roughly half the frame rate of the same scene in a
  native Unity build — is consistent with "fine for a fish tank, wrong tool for a game".
- **Battery and thermals.** This is where 3D actually hurts, and it's specific to *this* app.
  A Pomodoro timer holds the screen on for 25 minutes at a stretch, and users run several
  sessions a day. A continuously-rendering WebGL loop for 25 minutes is a materially different
  power profile from a Skia canvas that can idle. Mitigations exist and are real — set r3f's
  `frameloop="demand"` outside an active session, cap the backbuffer DPR (the prototype already
  calls `gl.setPixelRatio(min(1.5, …))`, because the native `Canvas` deliberately omits the web
  `dpr` prop), drop the fish to a slow idle when the timer isn't running. But they are work, and
  they are work you must do, not optimisations you can skip.
- **The thread question, which matters more than either.** `@react-three/fiber`'s render loop runs
  on the JS thread via `requestAnimationFrame`, and every `useFrame` callback — one per fish —
  runs there too. Meanwhile Skia + Reanimated 4 run animations on the **UI thread** as worklets.
  This app ticks a timer once a second while the tank is visible; under 2D that React re-render
  physically cannot stutter the fish, under 3D it shares a thread with them. You can work around
  it (drive the timer text through Reanimated shared values so the JS thread stays quiet), but
  under 2D it isn't a problem you have.

### The Forest comparison, honestly

Forest is the reason this question came up, so it's worth being precise about why it isn't
evidence that a 3D aquarium is cheap:

- Forest renders **one** object, and a nearly static one — a tree that grows slowly over 25
  minutes. An aquarium is 10–20 objects in continuous independent motion. Those are different
  orders of scene cost.
- Forest is a **native** app. It has no `expo-gl` layer, no JS-thread render loop, and no Expo Go
  constraint. It can use Metal directly.
- Forest sells *tree species* as cosmetics — and it has a studio's art budget behind that
  catalogue. That is precisely the cost this report is warning you about, seen from the other side.

"Forest does 3D and it's fine" is true, and it does not transfer.

---

## 3. Visual quality and fidelity

Where 3D genuinely wins, no hedging:

- **Depth reads as depth.** Fish that turn through perspective, pass behind coral, and catch light
  from above look alive in a way a 2D layer stack has to fake with scale and blur tricks.
- **The round bowl is dramatically better in 3D.** In 2D a bowl is an ellipse you clip against —
  it reads as a *shape*. In 3D it reads as a *volume*, with fish arcing around the curve and
  through the glass line. If tank shapes are meant to feel like a real purchase, this is the
  single strongest argument in 3D's favour.
- **One lighting change restyles everything.** Night mode, a "sick fish" desaturation, a merge-
  burst glow — in 3D these are light/material tweaks that apply to every asset at once. In 2D each
  is drawn by hand per state.

Where 2D wins, also without hedging:

- **A stylised 2D fish at 60fps beats a mediocre 3D fish at 40fps**, every time. Untextured
  low-poly 3D looks like a prototype — which is exactly what this branch looks like right now.
  Getting 3D to look *good* is not a rendering problem, it's an art problem, and it is the whole
  budget.
- **The 2D design is already fully specified** in `PLAN.md` M2 — body/tail/fin parameters, idle
  swim loop, shared primitives (single tank clock, particle burst, ripple/glow, motion tokens,
  reduce-motion hook). That specification is an asset. Adopting 3D throws most of it away.
- **Procedural 2D scales visually for free.** Nudge the parameters and you have a new species that
  is visually coherent with every other one, automatically. 3D coherence has to be art-directed.

---

## 4. Implementation complexity and time

| | 2D — Skia | 3D — expo-gl + three |
|---|---|---|
| Design status | Fully specified (`PLAN.md` M2) | This spike only |
| Renderer | Procedural — code, no assets | Assets required |
| Time to a *good* tank | ~1 week (M2 as planned) | ~3–5 weeks |
| Per-species marginal cost | **Hours** — a parameter record | **Days** — model, UV, texture, rig |
| Per-tank-shape marginal cost | Hours — a path + bounds function | ~1 day — geometry + relight |
| Team skills needed | TypeScript | TypeScript **+ 3D art** |
| Debuggability | Deterministic, inspectable | GPU/shader debugging on device |

The 3–5 week estimate for 3D breaks down roughly as: sourcing or modelling low-poly fish (CC0
libraries exist — Poly Pizza, Sketchfab — but "free" models still need retopology, consistent
scale and a shared art direction, and free assets rarely look like a set); rigging a swim cycle
(either a two-bone tail skeleton in Blender exported to glTF and played through
`THREE.AnimationMixer`, or — better for mobile — skip skeletons entirely and bend the mesh in a
vertex shader by phase, which is what mobile games actually do); building the instancing and
frame-loop-gating work described above; and the lighting/material pass that decides whether it
looks premium or looks like a school project.

None of that is exotic. All of it is time the 2D path has already banked.

And the marginal-cost row is the one that compounds. Ten species over the app's life is ten
afternoons in 2D and ten *weeks* in 3D.

---

## 5. Selling tank shapes as IAP

This was a specific ask — a round bowl alongside a rectangular tank — so it gets its own verdict.

**Both approaches support it well, and neither one is blocked.** The prototype demonstrates the
architecture that makes it cheap, and that architecture is not 3D-specific:

```ts
// src/features/aquarium3d/tanks.ts — a tank SKU is a record, not a scene
{ id: 'bowl', name: 'Moon Bowl', shape: 'bowl',
  half: { x: 1.5, y: 1.5, z: 1.5 }, productId: 'tank.bowl', priceLabel: '$1.99' }
```

Fish motion is written once against a unit volume, and each shape supplies only a *containment
function* (`src/features/aquarium3d/swim.ts`): a box clamps per-axis, a cylinder clamps the
horizontal radius, a bowl normalises onto a sphere. Because containment is the shape equation
itself rather than a per-frame collision test, fish can never clip through the glass, and adding
a SKU adds a record — not new scene code, not new swim logic. **The identical pattern works in 2D**
with a Skia `Path` for the silhouette, a clip, and a 2D bounds function.

So the comparison is fidelity, not capability:

| | 2D — Skia | 3D |
|---|---|---|
| Rectangular tank | Straightforward | Straightforward |
| Round bowl | Reads as a shape change | **Reads as a genuine volume — clearly better** |
| Tall column | Straightforward | Straightforward |
| Cost per new shape | Hours | ~1 day |
| Perceived value of the purchase | Moderate | **High** |

3D makes tank shapes a *better* purchase. It does not make them a *possible* one. If tank shapes
were only viable in 3D, that would be a strong reason to adopt 3D — they aren't, so it isn't.

Worth noting either way: tank shapes are a much better-behaved IAP than species, because there
are only ever a handful of them and they're bounded content. **Species** are the unbounded
catalogue, and species are where the 3D art cost becomes unbounded with them.

---

## 6. Bottom line

| Criterion | 2D Skia | 3D | Winner |
|---|---|---|---|
| Expo Go (free phase survives) | Yes | Yes | Tie |
| Bundle size | 3.81 MB | 5.49 MB + assets | **2D** |
| Frame rate headroom, old iPhones | High | Adequate with work | **2D** |
| Battery over a 25-min session | Low | Higher, needs gating | **2D** |
| Animation thread safety | UI thread (worklets) | JS thread | **2D** |
| iOS graphics API longevity | Metal | Deprecated OpenGL ES | **2D** |
| Visual fidelity ceiling | Good, stylised | **Higher** | **3D** |
| Round-bowl IAP appeal | Fine | **Better** | **3D** |
| Time to ship v1 | ~1 week (planned) | ~3–5 weeks | **2D** |
| Cost per new species SKU | Hours | Days | **2D — decisively** |
| Design work already done | All of M2 | This spike | **2D** |

**Verdict: build v1 with the 2D Skia design already in `PLAN.md`. Keep this branch.**

Revisit at the **M6a decision gate**. By then you'll have used the free build daily and will know
the thing this report can't tell you: whether the aquarium is a reward you glance at, or the
reason you open the app. If it's the former, 2D was always right. If it's the latter — and you're
willing to fund art, or you'd rather sell a few beautiful tanks than many cheap species — then
this branch is a working head start, and the `expo-gl` situation is the main thing to re-check
before committing.

Nothing here changes the committed MVP direction. The 2D Skia path stands.

---

## Appendix — sources

Primary (read directly, this machine):

- `node_modules/expo-gl@16.0.10/ios/EXGLContext.mm`, `ios/GLView.swift` — `EAGLContext` /
  `CAEAGLLayer`, i.e. OpenGL ES, not Metal
- `node_modules/@shopify/react-native-skia@2.2.12/apple/MetalContext.mm`,
  `RNSkMetalCanvasProvider.mm` — Metal
- `node_modules/expo/bundledNativeModules.json` — `expo-gl: ~16.0.10` for SDK 54
- `node_modules/@react-three/fiber@9.7.0/package.json` — peer deps incl. `expo-gl: ">=11.0"`
- `node_modules/@react-three/fiber/dist/declarations/src/native/Canvas.d.ts` — native `CanvasProps`
  omits `dpr`
- `npx expo export --platform ios` output on both branches — the bundle sizes above

Web (2026):

- [GLView — Expo SDK 54 docs](https://docs.expo.dev/versions/v54.0.0/sdk/gl-view/) — "Included in Expo Go"
- [Expo Go and the App Store, May 2026](https://expo.dev/changelog/expo-go-and-app-store-may-2026) — SDK 54 is still the App Store Expo Go build
- [expo-gl CHANGELOG](https://github.com/expo/expo/blob/main/packages/expo-gl/CHANGELOG.md) — Fabric support from 15.0.1; actively maintained through 2026
- [React Three Fiber installation docs](https://r3f.docs.pmnd.rs/getting-started/installation) — native requirements, built-in loader polyfills
- [expo-three](https://github.com/expo/expo-three) — still published, no longer required with r3f
- [expo-three issue #258](https://github.com/expo/expo-three/issues/258) — ~half the frame rate of an equivalent native Unity scene
- [Apple: Migrating OpenGL code to Metal](https://developer.apple.com/documentation/metal/migrating-opengl-code-to-metal) — OpenGL ES deprecated since iOS 12
