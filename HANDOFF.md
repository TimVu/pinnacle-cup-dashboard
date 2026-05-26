# Pinnacle Cup Dashboard — Handoff Document

**Status:** Complete — all phases shipped, deployed to Firebase Hosting  
**Live URL:** https://pinnacle-cup-ios.web.app  
**GitHub:** https://github.com/TimVu/pinnacle-cup-dashboard  
**Event:** June 4, 2026 — Lake Course at Wasatch Mountain Golf Club, Midway UT

**iOS App HANDOFF.md:** `/Users/timvu/Documents/Claude Work/Pinnacle Cup iOS/HANDOFF.md`

---

## What was built

A single-file (`index.html`) real-time TV dashboard that reads from the same Firestore backend as the Pinnacle Cup iOS app. No new backend. Read-only. No user interaction required.

**Deployed via:** Firebase Hosting → Yodeck URL widget → clubhouse TV  
**Screen target:** 1920×1080, horizontal, Yodeck Chromium player

---

## Firebase connection

| Item | Value |
|------|-------|
| Project ID | `pinnacle-cup-ios` |
| Firestore region | `us-west1` |
| Auth | None — anonymous public read |
| Config file | `firebase-config.js` (gitignored) |

### Firestore collections read

| Path | Key fields used |
|------|----------------|
| `config/branding` | `eventLogoUrl`, `courseLogoUrl`, `courseLogoName` |
| `config/course` | `holes[18]` → `{number, par, yards}` |
| `config/competitions` | `ctpHole`, `ldHole` |
| `teams/{id}` | `name`, `sortOrder` |
| `scores/{id}` | `holes[18]` (int or null), `submitted` (bool) |
| `feed/{id}` | `author`, `text`, `type`, `imageUrl`, `holeNumber`, `teamId`/`teamName`, `timestamp` |
| `prizes/closestToPin` | `leader` (person name), `final` (bool), `hole` |
| `prizes/longestDrive` | same |
| `shotTracers/{id}` | `teamId`, `teamName`, `videoUrl`, `holeNumber`, `timestamp` |

**Team IDs:** `towhees`, `magpies`, `eagles`, `warblers`, `hawks`

---

## ★ How to set the logos

### Step 1 — Host your images

Upload to Firebase Storage (same project):
1. Firebase Console → `pinnacle-cup-ios` → Storage → Upload file
2. Click the file → copy the Download URL

### Step 2 — Set fields in Firestore

Navigate to `config` → `branding` document and set:

| Field | Type | Effect |
|-------|------|--------|
| `eventLogoUrl` | string | Event logo in the top-left header slot |
| `courseLogoUrl` | string | Course logo in the footer right |
| `courseLogoName` | string | Text label next to course logo |

Empty string → that slot renders nothing gracefully.

### Logo specs

| Slot | Renders at | Recommended source |
|------|-----------|-------------------|
| Event logo | 38×38px rounded square | 200×200px PNG, transparent bg |
| Course logo | 26×26px in footer | Any size PNG, transparent bg |

---

## Layout

```
HEADER (58px, SummitBrown):
  [Event logo] THE PINNACLE CUP   [Summit tag] [scene dots] [● LIVE]

BODY (flex row, 1px gaps):
  LEFT 25%          CENTER ~47% (flex:1)           RIGHT 28%
  ─────────────     ──────────────────────────     ──────────
  "Team Prize"      [scene dots bar]                Activity
  Leader hero       #featured-card (flex:4)          feed
  (summitBrown)       photo scene OR                 (5 posts,
  5 team rows         shot tracer scene               text +
  "Individual       .highlights-bottom (flex:2)       photos)
   Prizes"            [#hole-spotlight] [heatmap]
  CTP + LD rows

FOOTER (34px): ● LIVE [ticker] [course logo] [QR]
```

---

## Design tokens

| Token | Hex | Usage |
|-------|-----|-------|
| SummitBrown | `#432525` | Header, leader hero, hole headers |
| SummitCornflower | `#94B5FF` | Score accents, event logo bg, heatmap ring |
| SummitButter | `#F8FDCB` | Title text on brown |
| System BG | `#F2F2F7` | Panel backgrounds |
| Card White | `rgba(255,255,255,0.92)` | Card surfaces |
| Eagle | `#FFD60A` | Eagle scores |
| Birdie | `#34C759` | Birdie scores |
| Par | `#8E8E93` | Par scores |
| Bogey | `#FF3B30` | Bogey scores |

---

## JS architecture

All JavaScript is in a single `<script>` block at the bottom of `index.html`.

| Symbol | Type | Purpose |
|--------|------|---------|
| `state` | object | Single source of truth for all live data |
| `subscribeAll(db)` | function | Sets up 9 Firestore listeners |
| `computeLeaderboard()` | function | Calculates to-par and rank order |
| `renderLeaderboard()` | function | FLIP-animated leaderboard DOM update |
| `renderHoleSpotlight()` | function | Updates hole card, heatmap, stats |
| `renderFeed()` | function | Updates activity feed |
| `renderFeaturedCard(post)` | function | Updates highlights photo scene |
| `renderHeatmap(hole)` | function | Updates 18-chip heatmap grid |
| `SceneRotator` | class | Cycles highlights (photos → tracers, 20s) |
| `HoleSpotlightRotator` | class | Cycles hole spotlight (25s) |
| `PrizeReveal` | class | Queued prize announcements, 12s hold |

### Key constants

```javascript
RANK_DELTA_TIMEOUT_MS = 600_000  // 10 min — rank arrows fade after this
FEED_MAX_DISPLAY      = 5        // posts shown in activity feed
SCENE_INTERVAL_MS     = 20_000   // 20s per highlights scene
SPOTLIGHT_INTERVAL_MS = 25_000   // 25s per hole spotlight
DIRECTOR_RECENCY_MS   = 1_800_000 // 30 min — director posts get priority
```

---

## Scene rotation logic

**SceneRotator** (highlights panel, 20s interval):
1. Director photo posts < 30 min old — always shown first
2. Team photo posts (must have `imageUrl` — text-only posts excluded)
3. Shot tracer videos interleaved after every 2nd photo
- Only images and videos appear in highlights; text-only posts go to feed only

**HoleSpotlightRotator** (25s interval):
- Cycles holes with at least one submitted score
- CTP hole shown first, LD hole second, then natural order
- Fades card opacity to 0.15 on transition, updates, fades back

---

## Prize reveal

Triggered when `prizes/closestToPin.final` or `prizes/longestDrive.final` flips to `true`.

- Full-screen overlay fades in (0.6s)
- Card scales from 85% → 100% with spring easing
- Holds for **12 seconds**, then auto-dismisses
- If both prizes finalize simultaneously, **CTP shows first**, LD queues behind it
- Individual winner name (NOT team name — `leader` field is a person)

---

## Rank delta system

- On each `scores` snapshot, rank order is computed fresh
- Previous ranks stored in `state.prevRanks`
- Changes recorded in `state.rankDeltas[teamId]` with timestamp
- Arrows (▲/▼) shown for 10 minutes, then fade via `transition: color 0.6s ease`
- FLIP animation slides rows to new positions when order changes

---

## Deployment

```bash
# First time
npm install -g firebase-tools
firebase login

# Every deploy
cd "Pinnacle Cup Dashboard"
firebase deploy --only hosting
```

Deploy takes ~30 seconds. Yodeck picks up changes on its next page load.

### Firestore rules

The dashboard reads without auth. Confirm these collections allow public reads in Firebase Console → Firestore → Rules:

```
config, teams, scores, feed, prizes, shotTracers
```

Minimum rule pattern:
```
allow read: if true;
allow write: if request.auth != null;
```

---

## Yodeck setup

1. Yodeck → Media → Add Media → Web Page
2. URL: `https://pinnacle-cup-ios.web.app`
3. Refresh interval: **Never** (Firestore keeps it live)
4. Zoom: **100%**
5. Add to playlist as full-screen widget

---

## File structure

```
pinnacle-cup-dashboard/
├── index.html                  # Complete dashboard (HTML + CSS + JS)
├── firebase-config.js          # Real credentials — gitignored, not in repo
├── firebase-config.js.example  # Template — committed to repo
├── firebase.json               # Hosting config (public: ".", no rewrites)
├── .firebaserc                 # Project binding (pinnacle-cup-ios)
├── .gitignore
├── README.md
└── HANDOFF.md                  # This file
```

---

## Known constraints / gotchas

1. **`firebase-config.js`** is gitignored but required to run. Anyone cloning the repo needs to recreate it from the example file and populate real values from Firebase Console.
2. **Feed team name** — dashboard reads `post.teamName` first, then falls back to looking up `post.teamId` in `state.teams`. Either format works.
3. **Shot tracer video** — displayed with `object-fit: cover` (slight top/bottom crop on 4:3 video in a wider container). Acceptable for ball-flight arc content.
4. **Heatmap spotlight** — uses `box-shadow: 0 0 0 2px cornflower, 0 0 8px rgba(...)` — no `!important`, chip keeps its natural score color.
5. **`config/branding`** must be created manually in Firestore — the iOS app seed script doesn't create it.
