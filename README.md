# Pinnacle Cup — Live TV Dashboard

Real-time golf tournament dashboard built for the **Pinnacle Cup** at Pinnacle Summit 2026. Displayed on a clubhouse TV via Yodeck during the June 4, 2026 event at Wasatch Mountain Golf Club (Lake Course).

**Live URL:** https://pinnacle-cup-ios.web.app

---

## What it does

Connects to the same Firebase/Firestore backend as the iOS scoring app and displays a continuously updating TV layout with no interaction required:

- **Standings** — live team leaderboard with rank-change animations and movement arrows
- **Highlights** — rotating featured panel cycling through team photos and shot tracer videos
- **Hole spotlight** — detailed scoring breakdown for the current hole, cycling through all active holes
- **At a Glance heatmap** — 18-hole score overview (best team result per hole)
- **Activity feed** — real-time posts from teams and the tournament director
- **Individual prizes** — CTP and LD leaders with full-screen winner reveal on finalization
- **Ticker** — scrolling footer with live standings and activity

---

## File structure

```
pinnacle-cup-dashboard/
├── index.html              # Single-file dashboard (HTML + CSS + JS)
├── firebase-config.js      # Firebase credentials — NEVER commit (gitignored)
├── firebase-config.js.example  # Template for credentials
├── firebase.json           # Firebase Hosting config
├── .firebaserc             # Firebase project binding (pinnacle-cup-ios)
├── .gitignore
├── HANDOFF.md              # Full technical reference
└── README.md               # This file
```

---

## Setup

### 1. Firebase credentials

Copy the example file and fill in your values from Firebase Console → Project Settings → Web app:

```bash
cp firebase-config.js.example firebase-config.js
# Edit firebase-config.js with your apiKey, messagingSenderId, appId
```

### 2. Install Firebase CLI (one-time)

```bash
npm install -g firebase-tools
firebase login
```

### 3. Deploy

```bash
firebase deploy --only hosting
```

Live within ~30 seconds at https://pinnacle-cup-ios.web.app

---

## Setting logos

Logos are stored in Firestore at `config/branding`. Upload images to Firebase Storage, then set these fields:

| Field | Description |
|-------|-------------|
| `eventLogoUrl` | Event logo — appears in the top-left header slot |
| `courseLogoUrl` | Course logo — appears in the footer |
| `courseLogoName` | Course name text label next to the logo |

Leave a field empty and that slot hides gracefully.

---

## Future updates

Edit `index.html`, then re-deploy:

```bash
firebase deploy --only hosting
```

---

## Related

- **iOS App:** [Private repo — see iOS HANDOFF.md]
- **Firebase Project:** `pinnacle-cup-ios` (us-west1)
- **Yodeck:** URL widget → https://pinnacle-cup-ios.web.app, no refresh interval
