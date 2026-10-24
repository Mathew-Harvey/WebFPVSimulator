# Open in WebFPV, for TinyLaps

A button for [TinyLaps](https://tinylaps.kwayzu.com/) that opens the track being drawn in
the [WebFPV](https://webfpv.org) simulator. One press and the pilot is on the start pad of
that track with a whoop, ready to throttle up. No account, no upload, no second step.

## What is in here

| File | What it is |
| --- | --- |
| `webfpv-button.js` | The whole thing. One script, no dependencies, about 9 KB. |
| `demo.html` | A page with the button on it and a sample track, to try it before it goes on TinyLaps. |

## Put it on TinyLaps

1. Copy `webfpv-button.js` into the site's static files (for an Angular app, `public/` or
   `src/assets/`), and load it once, for example in `index.html`:

   ```html
   <script src="webfpv-button.js" defer></script>
   ```

2. Mount the button where it should sit, and give it a function that returns the track
   exactly as TinyLaps' Export writes it (the `whoop-gate-editor` object, or its JSON text):

   ```js
   WebFPV.mount(document.querySelector('#webfpv-slot'), {
     getTrack: () => buildExport(),   // whatever TinyLaps' Export JSON calls today
   });
   ```

   In an Angular component that is:

   ```ts
   declare const WebFPV: any;

   @Component({ selector: 'app-webfpv', template: '<span #slot></span>' })
   export class WebFpvButtonComponent implements AfterViewInit {
     @ViewChild('slot') slot!: ElementRef<HTMLElement>;
     @Input() getTrack!: () => unknown;
     ngAfterViewInit() {
       WebFPV.mount(this.slot.nativeElement, { getTrack: () => this.getTrack(), compact: true });
     }
   }
   ```

That is all. The track is read when the button is pressed, so it is always the one on screen.

### Options

`WebFPV.mount(element, options)`:

| Option | Default | What it does |
| --- | --- | --- |
| `getTrack` | required | Returns the export object or its JSON text. If it throws, the message is shown under the button. |
| `compact` | `false` | A smaller button without the FLY IT tab, for a toolbar. |
| `label` | `Open in WebFPV` | The words on the button. |
| `author` | none | A name to credit as the track's designer in WebFPV, if TinyLaps knows one. |
| `target` | `_blank` | `_blank` opens a new tab and leaves the editor where it is. `_self` opens the simulator in the same tab. |

### Your own button instead

If TinyLaps would rather draw its own button, call this from its click handler:

```js
WebFPV.open(track, { author: 'optional name' });
```

It has to be called inside the click itself, because a browser only lets a page open a new
tab while it is handling a click. `WebFPV.link(track)` resolves to the link without opening
it, for a Copy link button.

The button draws itself inside a shadow root, so the site's CSS cannot restyle it and its
CSS cannot touch the site. It looks like WebFPV's own menus, a panel from a manga
magazine: paper, ink and a sakura tab. It has a focus ring, honours reduced motion, and
falls back to system colours in forced colours mode.

## How it works

The track travels in the link, in the part after `#`:

```
https://webfpv.org/sim/?map=custom&craft=whoop65&fly=1#tinylaps=z.<payload>&by=<name>
```

`<payload>` is the export's JSON, compacted, compressed with raw deflate (the browser's
own `CompressionStream('deflate-raw')`) and written in base64url. A browser without
`CompressionStream` sends `j.` and the JSON itself in base64url instead, which is longer and
works the same. `&by=` is optional. A typical track is a link of one or two thousand
characters.

The part after `#` is never sent to any server, by the browser or by anything in between.
So nothing is uploaded and nothing is stored, on TinyLaps' side or on WebFPV's. The track
goes from the editor to the simulator inside the pilot's own browser, and it is not
published anywhere unless the pilot publishes it from WebFPV's track builder later.

Anything that can build that link can use it: the script is a convenience, not a
requirement, and the link format is the contract.

## What WebFPV makes of a track

The simulator reads the export with its own importer and builds a whoop track in its
10 by 12 m hall, at true size:

- **Pipes.** Each connection is a length of white PVC. Lengths that meet end to end on one
  line are joined. An upright stands on the floor; a level pipe sits at its height and rests
  on the uprights under it. A pipe that is not along one axis is left out.
- **Race points.** Each checkpoint is a gate with nothing built round it: the opening
  scores and lights like a gate, at its size, height and turn, flown the way its arrow
  points. A point flown more than once is one gate flown again.
- **Nav only points** (Export to VelociDrone off) shape the racing line and do not score.
- **Start and finish** is the first checkpoint, as in TinyLaps. A start pad is put behind
  it, facing through it, so the lap closes there.
- The build is centred in the hall. Anything that would stand outside it is left out.
- It is credited as from TinyLaps, with the designer's name when `author` is given.

The pilot can open it in WebFPV's track builder from the simulator's menu, where the same
JSON can also be imported by hand (More, Import), and from there publish it to WebFPV's
board to post times on it.

Limits are TinyLaps' own: 2,000 pipes, 256 race points and 2 MB of text. A file over them,
or one with no checkpoint to fly through, opens the simulator with a sentence saying why.

## Trying it

Open `demo.html` from any local web server (for example `python3 -m http.server` in this
folder, then <http://localhost:8000/demo.html>). Paste an export into the box or keep the
sample, and press the button. Every call takes `sim`, the address of another copy of the
simulator, for testing against one; leave it out in production.

## Licence

`webfpv-button.js` and `demo.html` are part of WebFPVSimulator and are free software under
the GNU General Public License, version 3 or later. WebFPV and the WebFPV marks belong to
the WebFPV project.
