# Deploying to Render

Your guess was right, and it is three resources, not two.

| Resource | Render type | Repo | Why this type |
| --- | --- | --- | --- |
| `webfpvsimulator` | Static Site | WebFPVSimulator | No server side. Never sleeps. Free. |
| `webfpv-board` | Web Service, Node | WebFPVSimulator-LeaderBoard | Has an API and holds state. |
| `webfpvleaderboard-db` | Postgres | attached to the board | The only durable store. |

The simulator is a static site and not a web service because it has no
server side at all. `dist/sim.wasm` is committed, the shell is plain ES
modules, and three.js comes from the CDN import map in `index.html`. There
is nothing to run. That also buys the most important property of the pair:
a Render static site never spins down, so the thing people actually fly is
always warm even when the board has gone to sleep.

The board has to be a web service because it has an API and it holds
state. It cannot be a static site.

Postgres is not optional on Render. The board can run off a JSON file in
`data/` and does so locally, but Render's filesystem is ephemeral: the file
is wiped on every deploy and every restart, so every published course and
every lap time would vanish the first time you pushed a commit. Attach the
database.

## The one circular dependency, and how to break it

Each side needs the other's URL.

- The board needs `SIM_ORIGIN` so its **Fly** and **Build** buttons know
  where to send people.
- The simulator needs the board's origin so **Publish**, the course list
  and **Report a bug** know where to talk.

The simulator is a static site, so it has no environment to read at run
time. Its side of the link is a constant in the source:
`PRODUCTION_BOARD_ORIGIN` in `src/share/board.js`.

So deploy the board first, take its URL, then deploy the simulator.

## The other reason the board goes first

The board decides which `schemaVersion` of a track document it will store,
and the builder writes the newest one. A simulator deployed ahead of the
board therefore publishes courses the board refuses, with a message about a
version rather than about anything the author did.

Today's version is **2**, which is where a course grew from one sponsor's
mark to five. The board accepts 1 and 2. Whenever
`SCHEMA_VERSION` in the simulator's `src/trackbuilder/model.js` goes up,
teach `inspectDocument` in the board's `src/validate.js` the new number and
deploy the board before the simulator, the same way round as the URL above.

## By hand, rather than from the blueprints

The blueprints below are the short path. If you would rather create each
resource yourself in the dashboard, these are the fields that matter. Every
one of them is a field the form gets wrong or leaves blank by default.

**Postgres.** Create it first, and note which region you put it in. Every
other resource has to go in that same region or the internal connection
string will not resolve.

**Web service, from the LeaderBoard repo.**

| Field | Value |
| --- | --- |
| Language | Node |
| Branch | `main` |
| Region | the same one the database is in |
| Root Directory | leave empty |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path (under Advanced) | `/api/health` |

Render's form prefills the build command with `yarn`. Change it. There is
no yarn lockfile here, so yarn resolves the dependency tree from scratch
and can install a different `pg` than the tests ran against.

Environment variables:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | the database's **Internal** connection string |
| `SIM_ORIGIN` | the simulator's URL, no trailing slash |
| `BOARD_TRUST_PROXY` | `1` |
| `BUGS_TOKEN` | optional, any random string |

Internal, not external, and this one is not a preference. Render's external
connection string requires SSL, and `store.js` builds its pool with a
connection string and nothing else. Handed the external URL, the board
fails to start. The internal one is the short hostname with no
`.<region>-postgres.render.com` on the end.

**Static site, from the simulator repo.**

| Field | Value |
| --- | --- |
| Branch | `main` |
| Root Directory | leave empty |
| Build Command | `test -f dist/sim.wasm && test -f tests/lib/simmod.js` |
| Publish Directory | `.` |

No environment variables, and no region field: a static site is on the CDN
rather than in a region.

The publish directory is the field to get right. It defaults to blank and
the form suggests `build` or `dist`. Both are wrong here. It has to be the
repository root, because the page reaches sideways across the tree for the
things it boots on: `src/main.js` imports `../tests/lib/simmod.js` to load
the module and fetches `../dist/sim.wasm` for its bytes. Publishing `dist`
serves a directory with one file in it.

## 1. The board and its database

Both come from one blueprint. In the Render dashboard: **New**, then
**Blueprint**, then pick `Mathew-Harvey/WebFPVSimulator-LeaderBoard`.
`render.yaml` in that repo creates the web service and the Postgres
instance together and wires `DATABASE_URL` between them.

Render appends a suffix to the hostname if `webfpv-board` is already
taken by someone else, so read the URL it actually gives you rather than
assuming it. Call it `BOARD_URL` for the rest of this page. It will look
like `https://webfpv-board.onrender.com`.

`SIM_ORIGIN` is deliberately left unset in the blueprint. The board starts
fine without it and falls back to `http://127.0.0.1:8000`, which just means
the Fly buttons point at nothing yet. Step 3 fixes that.

## 2. The simulator

Edit one line in `src/share/board.js`:

```js
export const PRODUCTION_BOARD_ORIGIN = 'https://webfpv-board.onrender.com';
```

Put your `BOARD_URL` there, with no trailing slash. Commit and push.

Then in Render: **New**, **Blueprint**, pick
`Mathew-Harvey/WebFPVSimulator`. Its `render.yaml` creates the static site.
Read the URL it gives you and call it `SIM_URL`.

That constant is the default, not a lock. A `?board=` query beats it, and
so does the origin stored by the Publish dialog, so you can point a browser
at a different board without another deploy.

## 3. Wire the board back to the simulator

On the `webfpv-board` service, under **Environment**, set:

```
SIM_ORIGIN = https://webfpvsimulator.onrender.com
```

Your `SIM_URL`, no trailing slash. Save, which redeploys the board.

Leave `BOARD_PUBLIC_ORIGIN` unset while the board is the whole site. It
works its own public origin out of the request, and `BOARD_TRUST_PROXY=1` in
the blueprint is what makes that come out as `https` rather than `http`. Set
it when the forwarded headers cannot tell the truth, which is what happens
behind a mount prefix: see section 5.

`BUGS_TOKEN` is optional. Set it to any random string and listing and
updating bug tickets will need `Authorization: Bearer <token>`. Testers can
still file tickets without it either way. Leave it unset while you are
still handing the link around.

## 4. Check it

In order, because each one depends on the last:

```bash
BOARD=https://webfpv-board.onrender.com
SIM=https://webfpvsimulator.onrender.com

# The board is up and talking to Postgres, not to a JSON file.
curl -s $BOARD/api/health
# {"ok":true,"store":"postgres"}     <- "file" means DATABASE_URL is missing

# The board knows where the simulator is, and knows its own https origin.
curl -s $BOARD/api/config
# {"simOrigin":"https://webfpvsimulator.onrender.com",
#  "boardOrigin":"https://webfpv-board.onrender.com"}

# The two files the simulator dies without.
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" $SIM/dist/sim.wasm
# 200 application/wasm
curl -s -o /dev/null -w "%{http_code}\n" $SIM/tests/lib/simmod.js
# 200
```

If `boardOrigin` comes back as `http://` rather than `https://`, then
`BOARD_TRUST_PROXY` is not set to `1`. Fix that before anything else: every
Fly link the board writes will be an `http://` URL, and a browser on an
`https` page refuses to follow those as mixed content.

Then in a browser, in this order:

1. Open `SIM_URL`. It should reach the flying menu.
2. Build a course, publish it, and confirm the Publish dialog offers your
   `BOARD_URL` rather than `127.0.0.1:3100`.
3. Open `BOARD_URL`. The course is listed, and its card thumbnail draws.
   The thumbnail is the simulator's `/src/share/orbit.html` in a cross
   origin iframe, so an empty card means the simulator is refusing to be
   framed.
4. Click **Fly this course**. It should open the simulator, load the
   course, and offer to post a time back when you finish a lap.
5. Press F8 in the simulator and file a test ticket. It should appear at
   `BOARD_URL/bugs`.

## 5. One domain in front of the three

Everything above deploys the three services to three addresses. This section
puts one domain in front of them, so that a visitor arriving at the front door
never leaves it:

| Address | What answers | Where it actually comes from |
| --- | --- | --- |
| `https://webfpv.org/` | the landing page | GitHub Pages, `Mathew-Harvey/landingpage-WebFPVSimulator-` |
| `https://webfpv.org/sim/` | the simulator and the track builder | the Render static site |
| `https://webfpv.org/board/` | the board and the bug inbox | the Render web service |

The thing doing the work is a Cloudflare Worker, `edge/router.js` in this
repository. It takes the first path segment off and passes the rest to the
right upstream, so the three services still serve from their own roots and
none of them has to know it is mounted anywhere. `/sim/dist/sim.wasm` arrives
at Render as `/dist/sim.wasm`, and `/board/api/tracks` arrives at the board as
`/api/tracks`.

**Why a Worker rather than a redirect or a rule.** A redirect puts
`onrender.com` back in the address bar, which is the one thing the domain
exists to stop. A Cloudflare Origin Rule cannot do it either: taking a prefix
off needs `regex_replace` in a rewrite rule, which is not on the free plan,
and both upstreams route by `Host`, so pointing an origin at them without
changing the Host lands on neither site.

### What changed in the three repositories, and why

The three pages used to fetch their own files from the site root, because each
one WAS the site root. Under one domain only the landing page still is, so a
leading slash from the simulator now asks the landing page for the physics and
gets its 404 page. Every one of those is now resolved against the page or the
module instead, which is the same URL when the app is served at a root and the
right one when it is not. Both mounts work, so nothing here is a one way door
and the onrender.com addresses keep working exactly as before.

| Repository | File | What moved |
| --- | --- | --- |
| simulator | `index.html` | the boot script and the three icon links, now relative |
| simulator | `src/main.js` | `/tests/lib/simmod.js` and `/dist/sim.wasm`, now resolved against the module |
| simulator | `configs/registry.js` | a tune's `.diff`, now resolved beside `registry.js` |
| simulator | `src/render/tracks.js` | the music crates, now resolved against the module |
| simulator | `src/ui/ui.js` | the orbit thumbnail in the Courses reel |
| simulator | `src/share/board.js` | `PRODUCTION_BOARD_ORIGIN` is now `https://webfpv.org/board` |
| board | `public/index.html`, `public/bugs.html` | icons, the inbox script, the back link |
| board | `public/app.js`, `public/bugs.js` | every `/api/...` fetch, now resolved against the page's own directory |
| board | `public/app.js` | `orbitHref`, which was silently dropping the `/sim` |
| landing | `src/config.js`, `index.html` | the simulator and board links now name `webfpv.org` |

Two of those deserve a note.

`MAP_MODULE_PREFIX` in `src/main.js` still has leading slashes and is meant
to. Those strings are never fetched: `moduleCounter` matches them as a
substring of each performance entry's full URL, and a shell at
`https://webfpv.org/sim/` still produces names containing `/src/maps/city/`.

`orbitHref` in the board's `public/app.js` is the one that would have been
hardest to find. It read `new URL('/src/share/orbit.html', config.simOrigin)`,
and a leading slash in `new URL` throws away everything in the base but the
scheme and the host. With the simulator at `https://webfpv.org/sim` that
produced `https://webfpv.org/src/share/orbit.html`, which is the landing page.
The board would have loaded, listed every course, and drawn an empty box where
each thumbnail should be. The two links either side of it concatenate rather
than resolve and were never affected, which is exactly why it was easy to miss.

`tests/` is deliberately untouched. The harness runs at a root on a laptop and
is not part of the public mount, so leaving it alone keeps the verify surface
where it was.

### Deploy it

**1. Create the Worker.** In the Cloudflare dashboard: **Compute (Workers)**,
then **Workers & Pages**, then **Create**, then **Start with Hello World!**,
then **Deploy**. Name it `webfpv-router`. Open **Edit code**, select
everything in the editor, paste the whole of `edge/router.js` over it, and
**Deploy** again.

From a checkout the same thing is one command, and no dependency is added to
`package.json` to do it:

```bash
npx wrangler deploy --config edge/wrangler.toml
```

**2. Give it the domain.** On the Worker: **Settings**, then **Domains &
Routes**, then **Add**, then **Custom domain**. Enter `webfpv.org` and add it.
Do it a second time for `www.webfpv.org`.

Custom domain rather than route, and the difference matters here. A route
needs a DNS record already pointing somewhere for the Worker to intercept, and
`webfpv.org` has no origin server to point at: the Worker is the origin. A
custom domain makes Cloudflare create the record and issue the certificate
itself. The zone's DNS page goes from "no DNS records" to one record per
hostname, both managed by the Worker.

The Worker sends `www` to the apex on arrival, so the site has one address
rather than two that both work.

**3. Tell the board where it lives.** On the `webfpv-board` service in Render,
under **Environment**, set both of these and save, which redeploys:

```
SIM_ORIGIN            = https://webfpv.org/sim
BOARD_PUBLIC_ORIGIN   = https://webfpv.org/board
```

`SIM_ORIGIN` is the same field as step 3 above with a new value, and every
consumer already treats it as a prefix and concatenates.

`BOARD_PUBLIC_ORIGIN` is the field this page told you to leave alone, and this
is the situation it exists for. `requestOrigin` works the board's own address
out of the forwarded headers, which now say `webfpv.org` and cannot say
`/board`, because a path is not part of a host. Left unset, every Fly link the
board writes and every `?board=` it hands the simulator would point at the
landing page. Set, it short circuits the whole calculation and answers with
the truth.

`BOARD_TRUST_PROXY` stays `1`. It is doing less work than it was, but it is
still what makes a direct visit to the onrender.com address report `https`.

**4. Deploy the three branches, and the Worker goes first.** This is the one
ordering that is not a preference. `PRODUCTION_BOARD_ORIGIN` in
`src/share/board.js` now reads `https://webfpv.org/board`, so a simulator that
reaches Render before the Worker is live has a board address that nothing is
answering: Publish, the community course list and the F8 bug reporter would
all be talking to a domain with no `/board` on it. Worker, then board, then
simulator, then landing page.

The rest is backwards compatible in both directions. Every path change in the
three repositories resolves to exactly the URL it used to at a root mount, so
`webfpvsimulator.onrender.com` and `webfpv-board.onrender.com` keep working
after the migration, and the mounted copies work before the Render redeploy
lands.

**Do not add a `CNAME` file to the landing repository.** GitHub Pages answers
a CNAME by redirecting `github.io` to the custom domain named in it. That
redirect would arrive back at the Worker, which would fetch `github.io`
again, and the two would pass it back and forth until Cloudflare gave up. The
landing page is proxied, not custom domained, and the absence of that file is
what keeps it that way.

### Things that will bite

**The board's page no longer believes the board about where the board is.**
`/api/config` returns a `boardOrigin` built from the request headers, and a
header carries a host, not a path: behind the mount it can only ever say
`https://webfpv.org`, which is the landing page. `public/app.js` now keeps its
own `HERE_ORIGIN`, taken from `document.baseURI`, and overrides that field. It
takes `simOrigin` from the server, because only the server knows it. Setting
`BOARD_PUBLIC_ORIGIN` is still worth doing so that `/api/config` tells the
truth to anything else reading it, but the Fly links no longer depend on it.

**A returning pilot carries the old board address around.** The resolved board
is written to `localStorage` under `webfpv.board.origin`, and a stored value
outranks the compiled default. Storage is per origin, so anyone arriving at
`webfpv.org/sim/` starts clean. Anyone who keeps using the onrender address
keeps the onrender board, which works, and is worth knowing when a bug report
says the wrong board.

**The three apps now share one origin, so they share one `localStorage`.** No
key collides today: the simulator writes `webfpv.board.origin`,
`webfpv.share.import.v1` and `webfpv.share.bind.v1`, the board writes
`webfpv.bugs.token` into `sessionStorage`. The namespace is shared from here
on, so every new key needs its prefix. The same is true of the IndexedDB store
behind the orbit thumbnails and the web lock that guards it: a pilot with the
board in one tab and the simulator in another now contends on one lock instead
of two.

**Do not add a Content Security Policy or a framing header at the Worker.**
There is none anywhere in the three repositories and that is deliberate: the
board draws every thumbnail by framing the simulator's `orbit.html`, and four
separate import maps load three.js from `cdn.jsdelivr.net`. A `script-src`
without jsDelivr would take down the landing page, the simulator, the builder
and every card on the board in one deploy.

**Do not add a Cloudflare cache rule for `webfpv.org`.** Three cache policies
now live on one hostname: the simulator's `no-cache` with the music crate
immutable for a year, the board's `no-store` on everything, and whatever Pages
does. They still match at the origin because the prefix comes off before the
request gets there, and the Worker passes the response headers through
untouched. One rule for the domain would flatten all three.

**The landing page's spelling of its own repository is case sensitive and
correct.** `edge/router.js` names
`https://mathew-harvey.github.io/landingpage-WebFPVSimulator-`. The lowercase
spelling 404s at Pages, checked rather than assumed, so leave the capitals
where they are.

### Check it

```bash
# The three mounts answer, and none of them is a redirect.
curl -s -o /dev/null -w "%{http_code} %{url_effective}\n" -L https://webfpv.org/
curl -s -o /dev/null -w "%{http_code} %{url_effective}\n" -L https://webfpv.org/sim/
curl -s -o /dev/null -w "%{http_code} %{url_effective}\n" -L https://webfpv.org/board/

# The prefix comes off before Render sees it.
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://webfpv.org/sim/dist/sim.wasm
# 200 application/wasm

# The board knows where it lives and where the simulator lives, WITH the paths.
curl -s https://webfpv.org/board/api/config
# {"simOrigin":"https://webfpv.org/sim","boardOrigin":"https://webfpv.org/board"}

# The missing slash is a permanent redirect, not a 404. Every relative url on
# the page below it depends on this.
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://webfpv.org/sim
# 301 https://webfpv.org/sim/

# www is one site, not two.
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://www.webfpv.org/
# 301 https://webfpv.org/
```

Then in a browser, in this order:

1. `https://webfpv.org/` and click **Fly now**. The address bar should read
   `https://webfpv.org/sim/?map=field` and the simulator should reach the
   flying menu.
2. `https://webfpv.org/board/`. Every course card's thumbnail should draw. An
   empty box is `orbitHref` or the `/sim` mount, not the simulator refusing to
   be framed, because nothing in this estate sets `X-Frame-Options`.
3. **Fly this course** from a card. It should land in the simulator with the
   course loaded and offer to post a time at the end of a lap.
4. Publish a course from the builder at
   `https://webfpv.org/sim/src/trackbuilder/index.html` and confirm the
   Publish dialog offers `https://webfpv.org/board`.
5. F8 in the simulator, file a test ticket, and find it at
   `https://webfpv.org/board/bugs`.

`node edge/selftest.js` covers the router's own string handling without an
account or a network: the three mounts, the trailing slash redirects, a POST
body surviving, and an upstream `Location` being put back inside the domain.
It is `npm run test:edge` and it takes a second.

### What the free plan will do to you here

**A Worker on the free plan gets 100,000 requests a day**, and every byte of
all three sites is now a Worker request. A cold visit to the city map is the
page, the module graph, `sim.wasm` and its assets, so think in hundreds of
requests per visitor rather than one. The music is the exception and stays the
exception: `/assets/music/*` is still immutable for a year, so the CDN answers
it without waking the Worker after the first time.

**The board still sleeps.** A first visitor after a quiet spell waits for
Render to wake the service, and the Worker waits with them. Cloudflare gives
up at around 100 seconds with a 524, which is longer than a Render cold start
but not by as much as you would like.

**Nothing about the SSL mode matters as much as it looks.** There is no origin
DNS record for Cloudflare to pull from, so the zone's SSL setting has almost
nothing to apply to: the Worker terminates the visitor's TLS at the edge and
opens its own HTTPS connection to Render and to Pages. Set it to **Full
(strict)** anyway, so that it says something true if a record is ever added.

## What the free tier will do to you

**The free Postgres instance is deleted after 30 days.** This is the one
that will actually hurt: it is not a downgrade, the database goes away and
the published courses go with it. If the board is meant to outlive a
month, move it to a paid instance before then. Check the current terms in
the dashboard, because Render has changed this more than once.

**The free web service sleeps after 15 minutes idle.** The first visitor
after a quiet spell waits somewhere around a minute for the board to wake.
Course lists and Fly links are slow on that first hit and normal after.
The simulator is unaffected, because a static site does not sleep.

**The free web service has 512 MB of RAM.** The board is a small Node
process with a pool of four Postgres connections, so this is not close to
tight.

If you want to spend the least money that makes this properly live, the
Postgres instance is the thing to pay for first. A sleeping board is a
slow first click. A deleted database is the courses gone.

## Notes on the two blueprints

**The simulator publishes the whole repo tree.** `staticPublishPath` is
`.`, and it has to be. The page reaches across the whole tree at boot,
including `../tests/lib/simmod.js`, which `src/main.js` imports to load the
WASM module. Those are resolved against the module rather than the site root,
which is what lets one tree serve at a root and under `/sim/`, but they still
span the repository. Trimming the publish path to `src` plus `dist` breaks
boot. The repo is public and GPLv3, so serving the tree gives nothing away.

**There is no build step, but there is a build command.** It is
`test -f dist/sim.wasm && test -f tests/lib/simmod.js`. Both are fetched at
boot, and a deploy missing either serves a page that dies on a 404 with
nothing useful in the log. Failing the deploy instead is
louder and names the file.

**Everything is served `Cache-Control: no-cache`, except the music.**
Nothing in the tree is content hashed, so a long cache can hand a visitor a
module graph that is half the old deploy and half the new one. That failure
reads like a physics bug rather than a caching bug. `no-cache` still lets
the CDN answer with a 304 off its ETag, so a returning visitor pays a round
trip and no bytes.

**`/assets/music/*` is the exception, and it is served immutable for a
year.** A track is not part of the module graph: nothing imports it and it
imports nothing, so a visitor holding last week's copy of one is holding a
song, not half a program. What `no-cache` costs there is a revalidation
round trip per track per visit on a two to five megabyte file that never
changes, which is the wrong trade on a phone. It also matters to the player:
near the end of a track `src/render/music.js` warms the next one through a
second element, and the handoff is only free if the browser can serve it out
of its own disk cache.

This is safe ONLY because of `MUSIC_REV` in `src/render/tracks.js`, which
goes into every music URL as `?v=N`. **Re-encode the crate, bump
`MUSIC_REV`.** A deploy that changes the audio without bumping it leaves a
year of browsers on the old mix with no way to find out. `scripts/serve.js`
and `tests/lib/server.js` both mirror this policy for the same directory, so
a re-encode needs the bump locally too, which is the point.

**Adding a track does not need the bump, and should not get one.** The rule
is about a URL whose CONTENT changed. A new id is a new URL that nobody
holds, so bumping for it would only throw away a year of correctly cached
copies of the twelve that did not change. The menu bed arrived that way:
two new ids, no bump.

**There are two crates in that one directory.** `TRACKS` is what plays in
flight and is what the Music track setting picks from; `MENU_TRACKS` is the
quieter bed that plays on every screen that is not a flight. They share the
directory, the id namespace, the encode settings and this cache rule,
because all four of those are about bytes on a wire and the difference
between the crates is only where they are played. What differs is the mix:
`MENU_BUS` in `src/render/music.js` runs the menu bed 9.5 dB under the
flight bed. One media element carries both, so the swap between them is
faded, and while the menus are up the player warms the flight track that
the next flight is going to ask for, which is the only reason a first
flight does not open on a cold 2.5 MB download.

**The crate is on disk in two formats and a visitor pays for one.** Every
track is `assets/music/<id>.webm` (Opus, about 2.5 MB) and
`assets/music/<id>.mp3` (LAME V7, about 3.1 MB), written by
`node scripts/music.js` from masters that are not in the repository. The
player asks `canPlayType` first and takes the WebM unless the browser cannot
open one, which is Safari before 14.1 on the desktop and 17.4 on the phone.
The masters for the twelve flight records are recoverable from commit
`f9e0804`; the two menu masters are not in this repository's history at all
and would have to be supplied again.
Render serves `.webm` as `video/webm` off its own extension table and that
is fine for an audio-only file; a browser that disagrees fails the load and
`music.js` demotes the whole session to mp3 rather than going quiet.

**Neither blueprint sets `X-Frame-Options` on the simulator.** The board
draws every course thumbnail by embedding the simulator's
`/src/share/orbit.html` in a cross origin iframe. Denying framing turns
every card on the board into an empty box.

**The database only listens on Render's private network.** `ipAllowList` is
empty in the board's blueprint, which is all the board needs. To run `psql`
from your laptop, open it under the database's **Access Control** in the
dashboard and use the external connection string Render gives you there,
which is a different string and carries SSL.

**`vendor/betaflight` is a submodule and the deploy does not need it.** The
WASM module is prebuilt and committed. If a static site deploy is slow or
fails while fetching submodules, nothing in the deployed site depends on
that tree.

## The share card

Every link to any of the three pages posted on Facebook, X, Messenger,
LinkedIn, WhatsApp or iMessage renders a 1200 by 630 card. Before this there
were no Open Graph tags at all on any of the three, so a shared link was a bare
URL with no picture.

`og.png` is that card, and it is a frame of the real shell rather than a
drawing of one: `scripts/og.js` drives `scripts/shots.js`, which drives the
actual page in headless Chromium, so the card cannot disagree with the product.
It is the title screen on the race field with the menu, the chips and the body
copy hidden, leaving the wordmark over the world, a camera parked low and to
the right of the course, and the lit start gate centre with the parked quad in
the near left.

Regenerate, do not edit, the same rule as the icons:

```bash
# This repo.
npm run gen:og

# All three, from a checkout of each beside this one.
node scripts/og.js . ../landingpage-WebFPVSimulator- \
                     ../WebFPVSimulator-LeaderBoard/public
```

The camera is six numbers at the top of `scripts/og.js`. Change them and the
card changes, which is why they live in a file rather than in somebody's shell
history.

**Every `og:image` is an absolute URL.** A crawler does not resolve a relative
one against the page it found it on, so each page names its own copy in full:
`https://webfpv.org/og.png`, `https://webfpv.org/sim/og.png`,
`https://webfpv.org/board/og.png`. Each service therefore carries its own copy
of the file, exactly as each carries its own icon set.

**No animated card, and it is not for want of trying.** Facebook, Messenger, X,
LinkedIn, WhatsApp, Slack and iMessage all flatten a link preview to one still
frame, and X converts an animated GIF to its first frame. Discord is the only
place that would animate one. A second asset for one platform is not worth the
drift between them.

**Facebook and X cache what they scraped.** Changing the card does not change
what a re-share shows until their crawler comes back. Force it with Facebook's
Sharing Debugger and X's Card Validator, one URL at a time.

## The site icons

Four pages carry the family mark, one shape with one accent each, so a
pilot with the simulator, the builder and the board open at once can tell
three tabs apart without reading them:

| Page | Accent | Where the files live |
| --- | --- | --- |
| Landing page | cream | the landing repo's root |
| Simulator | sakura | this repo's root |
| Track builder | amber | `src/trackbuilder/` |
| Board | mint | the board repo's `public/` |

Each set is `icon.svg`, `favicon.ico` at 16, 32 and 48, and
`apple-touch-icon.png` at 180. `scripts/icons.js` draws all of them from
one description of the mark, so the accent, the geometry or the sizes are
changed there and regenerated rather than edited in a paint program. There
is no build step on any of the three services, so the output is committed.

```bash
# The two in this repo.
npm run gen:icons

# The other two, from a checkout of each beside this one.
node scripts/icons.js cream ../landingpage-WebFPVSimulator-
node scripts/icons.js mint  ../WebFPVSimulator-LeaderBoard/public
```

**Every page names its icon, because a file at the site root is not
enough.** Six of the eight HTML files in the three repositories carried
`<link rel="icon" href="data:,">`: the simulator, the track builder,
`orbit.html`, the test harness and both board pages. That is not a missing
icon, it is an explicitly empty one, and it wins over `/favicon.ico`, so
committing the files without editing those tags would have changed nothing
on any of them. The landing page was the exception and already had a real
mark, drawn inline as a data URI; it now points at the file like the rest.
The eighth, `scripts/audio-probe.html`, has no icon tag at all and was the
one page in the project actually requesting `/favicon.ico` and getting a
404. It now gets the file.

**Two pages keep the empty icon on purpose.** `tests/browser/harness.html`
suppresses the request so that check 13, which counts every console message,
never has an icon in its blast radius at all. That is a smaller reason than
it used to be, and worth being straight about: the reason WAS that the
request 404ed, and now that `/favicon.ico` exists at the publish root and
`scripts/serve.js` knows the type, it would return 200. What is left is one
request saved on a page nobody looks at. `src/share/orbit.html` is only ever
a course thumbnail inside an iframe on the board, so an icon it would never
show is a request per card.

## Local, for comparison

Nothing above changes how this runs on your machine. The simulator picks
its board by its own hostname, and a loopback address still means the local
board on 3100.

```bash
# One terminal, the board.
cd WebFPVSimulator-LeaderBoard && npm install && npm start

# Another, the simulator.
cd WebFPVSimulator && npm run serve
```

Then open `http://127.0.0.1:8000/`.
