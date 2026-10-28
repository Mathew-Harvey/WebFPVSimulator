/*
 * webfpv-button.js: the Open in WebFPV button for TinyLaps.
 *
 * One file, no dependencies, no build step. It adds a button that sends the track the
 * pilot is drawing to WebFPV (https://webfpv.org), which opens it in the simulator and
 * puts the pilot on the start pad of it, flying a whoop. All the converting is done on
 * WebFPV's side, from the same JSON that TinyLaps' Export writes.
 *
 * HOW THE TRACK TRAVELS. In the fragment of the link (the part after #), as the raw
 * deflate of the JSON in base64url. A browser never sends the fragment to any server, so
 * this page uploads nothing and needs no account and no key. The simulator, once open,
 * publishes the track to WebFPV's public board, so it is listed there and pilots can post
 * times on it and open it in WebFPV's track builder.
 *
 * USE, after loading this file with a script tag:
 *
 *   WebFPV.mount(element, { getTrack: () => theTrackAsExportWouldWriteIt })
 *     puts the styled button inside `element`. getTrack returns the export object or its
 *     JSON text. Optional: author (a name to credit), label, compact (true for a smaller
 *     button), target ('_blank', the default, or '_self').
 *   WebFPV.open(track, { author, target })
 *     opens the simulator on a track, from any button of your own. Call it from inside
 *     the click handler, so the browser lets it open a tab.
 *   WebFPV.link(track, { author })
 *     resolves to the link itself, for a "copy link" or a test.
 *   Every call also takes `sim`, the address of another copy of the simulator, which is
 *   only for testing against one.
 *
 * Copyright (C) 2026 the WebFPVSimulator authors.
 *
 * Released under the MIT licence, at the WebFPV owner's choice, so it can sit in a site of
 * any licence. (The simulator it opens is GPLv3; MIT is compatible with that.)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
 * to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
 * PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
 * FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

(function (root) {
  'use strict';

  /* Where the simulator is, and what the link asks of it: the track's own map, the whoop,
   * and straight into the air. Change SIM only to point at a test copy of WebFPV. */
  var SIM = 'https://webfpv.org/sim/';
  var QUERY = '?map=custom&craft=whoop65&fly=1';

  /* TinyLaps' own limit on a track's text. WebFPV refuses anything larger. */
  var MAX_TEXT = 2 * 1024 * 1024;

  function textOf(track) {
    var text = typeof track === 'string' ? track : JSON.stringify(track);
    if (!text || text.length > MAX_TEXT) {
      throw new Error('That track is too large to send to WebFPV.');
    }
    /* Re-serialised compactly, so the link carries no indentation. */
    try {
      return JSON.stringify(JSON.parse(text));
    } catch (e) {
      throw new Error('That track is not JSON.');
    }
  }

  function base64url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* z. and the raw deflate where the browser has CompressionStream (every current one),
   * j. and the text itself where it has not. WebFPV reads both. */
  function payload(text) {
    var bytes = new TextEncoder().encode(text);
    if (typeof CompressionStream !== 'function') {
      return Promise.resolve('j.' + base64url(bytes));
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (buf) {
      return 'z.' + base64url(new Uint8Array(buf));
    });
  }

  function link(track, options) {
    var opts = options || {};
    var text;
    try {
      text = textOf(track);
    } catch (e) {
      return Promise.reject(e);
    }
    return payload(text).then(function (p) {
      var hash = 'tinylaps=' + p;
      if (opts.author) {
        hash += '&by=' + encodeURIComponent(String(opts.author).slice(0, 60));
      }
      return (opts.sim || SIM) + QUERY + '#' + hash;
    });
  }

  /*
   * Opens the simulator on a track. The new tab is opened FIRST, inside the click, because a
   * browser only lets a page open a tab while it is handling a click, and compressing the
   * track takes a moment after that. It is pointed at the simulator when the link is ready.
   * If the browser refused the tab anyway, the simulator opens in this one.
   */
  function open(track, options) {
    var opts = options || {};
    var tab = null;
    if ((opts.target || '_blank') === '_blank') {
      try {
        tab = root.open('', '_blank');
        if (tab) {
          tab.opener = null;
          tab.document.title = 'Opening in WebFPV';
          tab.document.body.style.cssText = 'margin:0;height:100vh;display:grid;place-items:center;background:#0b1116;color:#f7f0dc;font:600 16px system-ui,sans-serif';
          tab.document.body.textContent = 'Opening your track in WebFPV...';
        }
      } catch (e) {
        tab = null;
      }
    }
    return link(track, opts).then(function (url) {
      if (tab && !tab.closed) {
        tab.location.replace(url);
      } else {
        root.location.assign(url);
      }
      return url;
    }, function (err) {
      if (tab && !tab.closed) {
        tab.close();
      }
      throw err;
    });
  }

  /* The look: a panel from a manga magazine, paper and ink with a hard ink shadow and a
   * sakura tab, which is how WebFPV's own menus are drawn. It sits in a shadow root, so
   * nothing on the host page restyles it and nothing in it restyles the host page. */
  var CSS = [
    ':host{display:inline-block;vertical-align:middle}',
    'button{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;gap:.55em;',
    'padding:.5em .95em .5em .7em;border:2.5px solid #0b1116;border-radius:3px;',
    'background:#f7f0dc radial-gradient(#0b111618 1px,transparent 1.2px) 0 0/6px 6px;color:#0b1116;',
    'box-shadow:4px 4px 0 #0b1116,4px 4px 0 2px #e8a8b8;',
    'font:italic 900 15px/1 "Arial Black","Helvetica Neue",Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;',
    'transform:rotate(-1.2deg);transition:transform .08s ease,box-shadow .08s ease;-webkit-tap-highlight-color:transparent}',
    'button:hover{transform:rotate(-1.2deg) translate(-1px,-1px);box-shadow:5px 5px 0 #0b1116,5px 5px 0 2px #e8a8b8}',
    'button:active{transform:rotate(-1.2deg) translate(3px,3px);box-shadow:1px 1px 0 #0b1116,1px 1px 0 2px #e8a8b8}',
    'button:focus-visible{outline:3px solid #7dffb4;outline-offset:4px}',
    'button[disabled]{cursor:progress;opacity:.75}',
    'svg{width:1.5em;height:1.5em;flex:none}',
    '.tab{font:900 10px/1 system-ui,sans-serif;font-style:normal;letter-spacing:.12em;background:#e8a8b8;color:#0b1116;',
    'border:2px solid #0b1116;padding:.3em .45em;border-radius:2px;transform:rotate(2deg);margin-left:.15em}',
    ':host([compact]) button{font-size:12px;padding:.4em .7em .4em .5em;box-shadow:3px 3px 0 #0b1116,3px 3px 0 2px #e8a8b8}',
    ':host([compact]) .tab{display:none}',
    '.err{display:block;margin-top:.6em;font:600 12px/1.3 system-ui,sans-serif;color:#e8a8b8;max-width:22em}',
    '@media (prefers-reduced-motion:reduce){button{transition:none}}',
    '@media (forced-colors:active){button{border-color:ButtonText;box-shadow:none;background:ButtonFace;color:ButtonText}}',
  ].join('');

  /* A whoop from above, drawn in ink: four ducts and a body. */
  var ICON = '<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="#0b1116" stroke-width="2.6">'
    + '<circle cx="8" cy="8" r="5.2"/><circle cx="24" cy="8" r="5.2"/><circle cx="8" cy="24" r="5.2"/><circle cx="24" cy="24" r="5.2"/>'
    + '<rect x="12" y="11" width="8" height="10" rx="2" fill="#e8a8b8"/>'
    + '<path d="M16 3.5v4" stroke="#e8a8b8" stroke-width="2.2"/></svg>';

  function mount(element, options) {
    var opts = options || {};
    if (!element || typeof opts.getTrack !== 'function') {
      throw new Error('WebFPV.mount needs an element and a getTrack function.');
    }
    var host = document.createElement('webfpv-open');
    if (opts.compact) {
      host.setAttribute('compact', '');
    }
    var shadow = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = CSS;
    var button = document.createElement('button');
    button.type = 'button';
    button.title = 'Fly this track in the WebFPV simulator';
    button.innerHTML = ICON + '<span class="label"></span><span class="tab">FLY IT</span>';
    button.querySelector('.label').textContent = opts.label || 'Open in WebFPV';
    var err = document.createElement('span');
    err.className = 'err';
    err.setAttribute('role', 'status');
    shadow.append(style, button, err);
    button.addEventListener('click', function () {
      err.textContent = '';
      var track;
      try {
        track = opts.getTrack();
      } catch (e) {
        err.textContent = e && e.message ? e.message : String(e);
        return;
      }
      button.disabled = true;
      open(track, { author: opts.author, target: opts.target, sim: opts.sim }).catch(function (e) {
        err.textContent = e && e.message ? e.message : String(e);
      }).then(function () {
        button.disabled = false;
      });
    });
    element.appendChild(host);
    return host;
  }

  root.WebFPV = { mount: mount, open: open, link: link, version: 1 };
})(window);
