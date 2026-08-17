# Deploying to Render

Your guess was right, and it is three resources, not two.

| Resource | Render type | Repo | Why this type |
| --- | --- | --- | --- |
| `webfpvsim` | Static Site | WebFPVSimulator | No server side. Never sleeps. Free. |
| `webfpvleaderboard` | Web Service, Node | WebFPVSimulator-LeaderBoard | Has an API and holds state. |
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

## 1. The board and its database

Both come from one blueprint. In the Render dashboard: **New**, then
**Blueprint**, then pick `Mathew-Harvey/WebFPVSimulator-LeaderBoard`.
`render.yaml` in that repo creates the web service and the Postgres
instance together and wires `DATABASE_URL` between them.

Render appends a suffix to the hostname if `webfpvleaderboard` is already
taken by someone else, so read the URL it actually gives you rather than
assuming it. Call it `BOARD_URL` for the rest of this page. It will look
like `https://webfpvleaderboard.onrender.com`.

`SIM_ORIGIN` is deliberately left unset in the blueprint. The board starts
fine without it and falls back to `http://127.0.0.1:8000`, which just means
the Fly buttons point at nothing yet. Step 3 fixes that.

## 2. The simulator

Edit one line in `src/share/board.js`:

```js
export const PRODUCTION_BOARD_ORIGIN = 'https://webfpvleaderboard.onrender.com';
```

Put your `BOARD_URL` there, with no trailing slash. Commit and push.

Then in Render: **New**, **Blueprint**, pick
`Mathew-Harvey/WebFPVSimulator`. Its `render.yaml` creates the static site.
Read the URL it gives you and call it `SIM_URL`.

That constant is the default, not a lock. A `?board=` query beats it, and
so does the origin stored by the Publish dialog, so you can point a browser
at a different board without another deploy.

## 3. Wire the board back to the simulator

On the `webfpvleaderboard` service, under **Environment**, set:

```
SIM_ORIGIN = https://webfpvsim.onrender.com
```

Your `SIM_URL`, no trailing slash. Save, which redeploys the board.

Leave `BOARD_PUBLIC_ORIGIN` unset. The board works out its own public
origin from the request, and `BOARD_TRUST_PROXY=1` in the blueprint is what
makes that come out as `https` rather than `http`. Only set
`BOARD_PUBLIC_ORIGIN` if you put the board behind a custom domain and the
forwarded headers are not telling it the truth.

`BUGS_TOKEN` is optional. Set it to any random string and listing and
updating bug tickets will need `Authorization: Bearer <token>`. Testers can
still file tickets without it either way. Leave it unset while you are
still handing the link around.

## 4. Check it

In order, because each one depends on the last:

```bash
BOARD=https://webfpvleaderboard.onrender.com
SIM=https://webfpvsim.onrender.com

# The board is up and talking to Postgres, not to a JSON file.
curl -s $BOARD/api/health
# {"ok":true,"store":"postgres"}     <- "file" means DATABASE_URL is missing

# The board knows where the simulator is, and knows its own https origin.
curl -s $BOARD/api/config
# {"simOrigin":"https://webfpvsim.onrender.com",
#  "boardOrigin":"https://webfpvleaderboard.onrender.com"}

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
`.`, and it has to be. The page fetches by absolute path from the site
root, including `/tests/lib/simmod.js`, which `src/main.js` imports to load
the WASM module. Trimming the publish path to `src` plus `dist` breaks
boot. The repo is public and GPLv3, so serving the tree gives nothing away.

**There is no build step, but there is a build command.** It is
`test -f dist/sim.wasm && test -f tests/lib/simmod.js`. Both are fetched by
absolute path at boot, and a deploy missing either serves a page that dies
on a 404 with nothing useful in the log. Failing the deploy instead is
louder and names the file.

**Everything is served `Cache-Control: no-cache`.** Nothing in the tree is
content hashed, so a long cache can hand a visitor a module graph that is
half the old deploy and half the new one. That failure reads like a physics
bug rather than a caching bug. `no-cache` still lets the CDN answer with a
304 off its ETag, so a returning visitor pays a round trip and no bytes.

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
