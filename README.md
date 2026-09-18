# Match

Two crew rosters in, the days you can actually be together out.

Match reads the roster of two people and finds the days they are free **in the same place at the
same time** — at home base, or down route in the same city. It is installable, works offline, and
keeps both rosters on the device.

## Where it comes from

Nothing here is a new idea about rosters; it is two existing ones pointed at a different question.

- **Mechanics from [PWAPlog](https://github.com/rbozzhanov-web/PWAPlog)** — the npm-workspace split
  between a pure `packages/core` and a `apps/web` Vite/React PWA, the swipeable tab pager and dock,
  the offline service worker, the icon pipeline, and the rule that domain logic is tested in node
  with no DOM anywhere near it.
- **Logic from [KhaVair](https://github.com/rbozzhanov-web/LyubimkinoiAPP) and
  [eScrew](https://github.com/rbozzhanov-web/eScrew)** — the normalized roster contract, the AIMS
  Crew Schedule importer (sector text parsing, overnight rollover marks, the charset trap), the
  roster day-code table, and the station tracking that makes a layover a layover.

What is new is the layer on top: an availability model per person, and a match engine between two
of them.

## How a day is decided

Each roster becomes one entry per covered day, carrying **where** that person is and **when** they
are free:

| State | Meaning |
|---|---|
| `free` | At base, nothing rostered — or a rostered day off |
| `leave` | Annual, unpaid or child-care leave |
| `standby` | At base and available, but callable |
| `sick` | Free of duty, flagged rather than celebrated |
| `duty` | Working, but starts and ends at base — an evening can survive it |
| `away` | Down route; the free hours are real but they are in another city |
| `unknown` | No imported roster covers this day — never matches |

A duty costs more than its rostered hours, so report-to-release is widened by a **pre-duty buffer**
(the sleep and the drive in, which bleeds backwards into the evening before — a 05:00 report takes
last night with it) and a **post-duty buffer** (getting home). What is left inside the sociable part
of the day is that person's free time.

Two days then match when:

1. neither day is `unknown`, **and**
2. both people are at the **same station**, **and**
3. their free intervals overlap by at least the configured minimum.

The station check is what does the real work. It is the reason one person down route never matches
someone at home — and the reason two people down route *in the same city* do, which is the rarer
thing the app will tell you about.

Matched days are then grouped into **windows**: consecutive runs at one station, because three days
off in a row is a trip, not three evenings. A run breaks on a gap *or* on a change of place.

## Rosters

Three ways in, because two people rarely keep their time the same way:

- **AIMS Crew Schedule** — save the fully loaded Crew Schedule as a Web Archive and import it.
  Imports merge, so coverage grows month by month rather than being replaced.
- **Typed day codes** — one line per day, `2026-10-03 OFF`. Codes follow the roster's own table
  (`OFF`, `DOFF`, `VAC`, `AVLB`, `HOMS`, `SICK`…).
- **Weekends off** — a plain working week, for the half of these couples who do not fly.

A sample month is available on the Rosters tab to see how a pair of schedules reads before you have
your own.

## Develop and verify

```sh
npm install
npm run dev
npm run test        # 61 tests: engine in node, pages in jsdom
npm run typecheck
npm run build
```

`npm run generate:icons` re-renders the icon set from `apps/web/public/icon.svg` through headless
Chromium. It is not part of the build.

## Deploy

A static build: `npm run build` emits `apps/web/dist`, and that directory is the whole site.

### Cloudflare Pages (primary)

Wired through the dashboard's Git integration. Connect this repository under
*Workers & Pages → Create → Pages → Connect to Git*, pick `main` as the production branch, and set:

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `apps/web/dist` |
| Root directory | *(repository root — the build uses npm workspaces)* |
| Environment variable | `NODE_VERSION` = `22` |

`NODE_VERSION` matters: the Pages default is older than this build needs, and the failure it causes
does not name Node. Leave `PUBLIC_BASE_PATH` unset, because Pages serves the app from the domain
root. Every push to `main` then deploys itself, and `_redirects` hands React Router's own paths
(`/calendar`, `/people`, `/more`) back to `index.html` instead of 404ing on a direct visit or a
refresh.

`wrangler.toml` carries the same output directory, so a direct deploy is the alternative:
`npm run deploy:cloudflare`, with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the
environment.

### GitHub Pages

`.github/workflows/deploy-pages.yml` sets `PUBLIC_BASE_PATH=/Match/`, because that target serves the
app from a repository subpath rather than the root.

## Data

Both rosters live in this browser and nowhere else. There is no account, no sync and no backend;
the only thing that reaches the network is loading the app itself. Clearing them in **More** is the
whole of deleting them, and a calendar export is the only way anything leaves the device.

Real rosters contain personal information and must not be committed to this repository.

## Not done yet

- **Same-flight detection.** An AIMS schedule carries the crew list per sector, so two people
  rostered on the same aircraft is knowable and is arguably the most literal "together" of all. The
  importer currently drops crew; the match engine has no notion of it.
- **Time zones.** Matching is refused across stations rather than computed, so a shared layover is
  found but "you land in Almaty as she leaves Dubai" is not modelled. eScrew's `stationTime` has the
  zone table this would need.
