# WebFPV Leaderboard

The public board for [WebFPVSimulator](https://github.com/Mathew-Harvey/WebFPVSimulator).
Every published course lives here, with the times flown on it.

Create the empty GitHub repository `Mathew-Harvey/webfpvleaderboard`, then:

```bash
git remote add origin https://github.com/Mathew-Harvey/webfpvleaderboard.git
git push -u origin main
```

The simulator itself keeps nothing. Tracks you build stay in that browser
until you publish them. This page is the copy that other people can fly.

## How the three pages connect

The track document from the builder is the only payload. The logo travels
inside it, so a published course wears its sponsor print on every gate and
every flag.

```
Track builder                 This board                    Simulator
-------------                 ----------                    ---------
Publish  ------------------>  stores the course
                              Fly this course  ---------->  ?map=custom&share={id}
                                                            Post this time  ----->  that course's times
```

A Fly link looks like this:

```
{sim}/?map=custom&share=trk-1a2b3c4d&board={this origin}
```

The simulator fetches `/api/tracks/{id}/document`, builds the world, and
offers to post a lap time back here under the pilot's name.

## Run locally

Node 22 or newer. No database required: a JSON file in `data/` is enough.

```bash
npm install
npm start          # http://127.0.0.1:3100/
```

Point the simulator at this board by leaving the default
`http://127.0.0.1:3100` in the builder's Publish dialog, or by opening a
Fly link from this page.

```bash
npm test
```

## Postgres, when you want it

Set `DATABASE_URL` and the same process uses the schema in `schema.sql`.
A local instance:

```bash
docker compose up -d
DATABASE_URL=postgres://webfpv:webfpv@127.0.0.1:5432/webfpvleaderboard npm start
```

## Host on Render

This repo is ready for a Render Web Service plus a Render Postgres
instance. `render.yaml` is the blueprint.

1. Create the service from this repo. Start command is `npm start`.
2. Attach a Postgres database. Render sets `DATABASE_URL`.
3. Set `SIM_ORIGIN` to wherever the simulator is hosted, no trailing slash.
4. Optionally set `BOARD_PUBLIC_ORIGIN` to this service's public URL so
   Fly links can post times back even behind a proxy.

## API

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/tracks` | Every published course, with its best time |
| GET | `/api/tracks/:id` | That course and its leaderboard |
| GET | `/api/tracks/:id/document` | The full track document, logo included |
| POST | `/api/tracks` | Publish `{ author, document, editKey? }` |
| POST | `/api/tracks/:id/times` | Post `{ name, lapMs }` |
| GET | `/api/config` | `{ simOrigin, boardOrigin }` |

A first publish returns an `editKey`. Keep it in the browser that sent
the course. Publishing the same id again without that key is refused.
Changing the flying layout clears the old times, because they were flown
on a different course.

## Licence

GPLv3. See LICENSE.
