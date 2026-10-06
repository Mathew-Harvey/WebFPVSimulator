/*
 * roster.js: the partners, and the one list all three repositories read.
 *
 * WHO. Three businesses and a club back WebFPV, each exclusive in its kind:
 * Global Drone Solutions as the official training partner, Mantis FPV as the
 * official retail partner, and the West Coast Multirotor Club as the official
 * club partner. The owner named them on 2026-09-27 and approved the plan that
 * puts them on the front door, on Tracks and Times, on a partners page with a
 * dashboard for each of them, and painted into every freestyle map.
 *
 * WHY ONE LIST, AND WHY HERE. The front door draws their marks, the board
 * prints their cards and counts what they are owed, and the simulator paints
 * them into its maps. Three copies of a name, a link or a slug would drift the
 * first time one of them changed. This repository is the copy of record for
 * anything the three share, so the list lives here and is copied byte for
 * byte into the other two by their own scripts/vendor.js, the way
 * src/ui/lettering.js already is. A change is made here and copied again.
 *
 * WHAT A PARTNER IS, field by field:
 *
 *   slug    what travels in links, counters and stamps. The board's
 *           SOURCE_RE shape (src/sponsors.js there), so a partner's tracking
 *           link `?utm_source=<slug>` counts as theirs. It never changes once
 *           published: a poster with the link on it cannot be reprinted.
 *   name    the name as the partner writes it.
 *   short   the name where there is room for little: a find callout lettered
 *           over the flying, a table column.
 *   role    'training', 'retail' or 'club'. ROLE_TITLES says it in words.
 *   about   what they do, in a sentence or two, for their card on the
 *           partners page. DRAFTS, and each partner signs off their own
 *           before the page ships. THE RULE FOR THEM: say only what the
 *           partner says about themselves on their own site. Checked line
 *           by line against those sites on 2026-09-27, which took out
 *           GDS's office suburb (it is on their contact page, not something
 *           they promote), "every state" (they say across the country) and
 *           Mantis FPV's delivery offers, which carry conditions a sentence
 *           here would drop: free standard delivery over $150 and express
 *           over $250 excluding bulky items, and same day processing only
 *           for in stock orders before 11 am AEST on weekdays. An offer
 *           goes on a card in the partner's own words, conditions and all,
 *           or not at all.
 *   links   where their card sends people, first link first. `kind` is one of
 *           LINK_KINDS, because the board counts each link as a closed word.
 *   logo    the files under assets/partners/, as paths from the repository
 *           root (see LOGO FILES), and the artwork's width over its height.
 *   mark    how the simulator paints them into a freestyle map: `field` is
 *           the colour of the painted panel the logo sits on, dark for a logo
 *           drawn for dark grounds and cream for one drawn for light ones.
 *
 * LOGO FILES. Two per partner:
 *
 *   colour  the partner's own artwork in their own colours, for their card
 *           and for the paint in the world.
 *   mono    the same mark in one colour, the palette's cream, for the chrome:
 *           the partner row and the small lockups. On F1's own site every
 *           partner mark is one colour and one height; in the world they wear
 *           their livery. That is the rule the plan follows, and it is why
 *           the chrome never introduces a colour the palette does not have.
 *
 * The paths are from the REPOSITORY ROOT, as src/art/wallart-atlas.js names
 * its picture, not from this file: each repository copies the files to the
 * same path under the root it serves, and resolves them against that root.
 * Here that is the page at index.html; on the board it is public/.
 *
 * Where each file came from, and what is not ours about it, is in NOTICE.
 * scripts/partners.js checks every field here against the files, and makes
 * the one colour files that can be made mechanically (npm run gen:partners,
 * npm run lint:partners). Imports nothing, touches no DOM, reads no clock:
 * the board's server and Node's checks import it as it is.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

/* The three kinds, and how each is said. "Official" because each partner is
 * the only one of its kind, which is what the owner agreed with them. */
export const ROLE_TITLES = Object.freeze({
  training: 'Official training partner',
  retail: 'Official retail partner',
  club: 'Official club partner',
});

/* What a link on a partner's card can be. A closed list, because the board
 * counts clicks per link and a stranger must not be able to invent a word. */
export const LINK_KINDS = Object.freeze(['site', 'youtube', 'facebook']);

/* Where the logo files live, from the repository root. */
export const LOGO_DIR = 'assets/partners';

const partner = (p) => Object.freeze({
  ...p,
  links: p.links ? Object.freeze(p.links.map((l) => Object.freeze({ ...l }))) : undefined,
  logo: p.logo ? Object.freeze({ ...p.logo }) : undefined,
  mark: Object.freeze({ ...p.mark }),
});

/*
 * The list, in the order every surface shows it: training, retail, club.
 *
 * GDS's files are a WebFPV redraw of their public logo, not a file GDS
 * supplied, and each file's <title> says so. They stand until GDS approves
 * the redraw or sends a vector of their own. The club's are a PNG, so its one
 * colour file is a PNG too; a vector from the club replaces both.
 */
export const PARTNERS = Object.freeze([
  partner({
    slug: 'gds',
    name: 'Global Drone Solutions',
    short: 'GDS',
    role: 'training',
    about: 'CASA approved drone training across Australia, from a first Remote Pilot Licence to Beyond Visual Line of Sight and the Powered Lift endorsement. Over 7,500 graduates.',
    links: [
      /* globaldronesolutions.com.au answers with a redirect to this address,
       * so the link goes to where it lands rather than through a hop. */
      { kind: 'site', label: 'Visit Global Drone Solutions', href: 'https://gdronesolutions.com/' },
    ],
    logo: { colour: 'gds/colour.svg', mono: 'gds/mono.svg', aspect: 208 / 72 },
    mark: { field: '#19171e' },
  }),
  partner({
    slug: 'mantisfpv',
    name: 'Mantis FPV',
    short: 'Mantis FPV',
    role: 'retail',
    about: 'Australian FPV drone parts and service, online and in store in Parramatta, Sydney, with a repair and build service and one to one coaching in their workshop. Australian based, with worldwide shipping.',
    links: [
      { kind: 'site', label: 'Visit Mantis FPV', href: 'https://www.mantisfpv.com.au/' },
    ],
    logo: { colour: 'mantisfpv/colour.svg', mono: 'mantisfpv/mono.svg', aspect: 1868.79 / 329.61 },
    mark: { field: '#f3ead4' },
  }),
  partner({
    slug: 'wcmrc',
    name: 'West Coast Multirotor Club',
    short: 'WCMRC',
    role: 'club',
    about: "Perth's FPV drone racing club. Fortnightly race events through the year, plus casual beginner friendly race and freestyle days, at their home base, Thomas Kelly Pavilion in Kwinana.",
    /* The three the owner named on 2026-09-27. wcmrc.com.au is a different
     * club, West Coast Model RC, which races cars: never link it. The
     * club's own site links its Facebook group by name,
     * facebook.com/groups/westcoastmultirotorclub; the number here is the
     * one the owner gave, and whether the two are one group could not be
     * checked without a Facebook login. */
    links: [
      { kind: 'site', label: 'Visit the club', href: 'https://westcoastmultirotors.com.au/' },
      { kind: 'youtube', label: 'YouTube', href: 'https://www.youtube.com/@westcoastmultirotorsclub' },
      { kind: 'facebook', label: 'Facebook group', href: 'https://www.facebook.com/groups/657768627690432' },
    ],
    logo: { colour: 'wcmrc/colour.png', mono: 'wcmrc/mono.png', aspect: 708 / 252 },
    mark: { field: '#f3ead4' },
  }),
]);

/*
 * Maps-only partners: shown on freestyle maps (painted walls and find-the-logo
 * stamps) but NOT on the front page, leaderboard or partners page. These
 * partners are listed separately so the other repositories' vendored roster.js
 * consumers (which copy PARTNERS byte for byte) need no changes.
 */
export const MAP_ONLY_PARTNERS = Object.freeze([
  partner({
    slug: 'mattsflooring',
    name: "Matt's Flooring Pty Ltd",
    short: "Matt's Flooring",
    about: 'Flooring company.',
    links: [
      { kind: 'site', label: "Visit Matt's Flooring", href: 'https://www.mattsflooring.com.au/' },
    ],
    logo: { colour: 'mattsflooring/colour.png', mono: 'mattsflooring/mono.png', aspect: 499 / 111 },
    mark: { field: '#f3ead4' },
  }),
]);

/*
 * Patron map brands: Patreon supporter tier. Each patron's logo, or a name
 * they choose, is painted as a sign into freestyle maps the same way the
 * map-only partners already are. Every name or logo needs a human OK before
 * it is added. Patrons do not appear on the front page, leaderboard, or
 * partners page. They appear only on freestyle maps. Patrons are not
 * findable: their signs do not stamp, count toward achievements, or show the
 * found panel when discovered.
 */
export const PATRON_MAP_BRANDS = Object.freeze([
  // Magnus Arge's $25 Patreon 'Your sign in the sim' logo, supplied by the patron on 2026-10-06, OK'd by the owner.
  partner({
    slug: 'quadconfig',
    name: 'Quad Configurator',
    short: 'Quad Configurator',
    logo: { colour: 'quadconfig/colour.png', mono: 'quadconfig/mono.png', aspect: 1882 / 400 },
    mark: { field: '#323f5d' },
  }),
]);

export const PARTNER_SLUGS = Object.freeze(PARTNERS.map((p) => p.slug));
export const MAP_ONLY_PARTNER_SLUGS = Object.freeze(MAP_ONLY_PARTNERS.map((p) => p.slug));
export const PATRON_MAP_BRAND_SLUGS = Object.freeze(PATRON_MAP_BRANDS.map((p) => p.slug));
// Includes patron slugs: any partner count built from ALL_PARTNER_SLUGS must filter patrons out.
export const ALL_PARTNER_SLUGS = Object.freeze([...PARTNER_SLUGS, ...MAP_ONLY_PARTNER_SLUGS, ...PATRON_MAP_BRAND_SLUGS]);

const BY_SLUG = new Map([...PARTNERS, ...MAP_ONLY_PARTNERS, ...PATRON_MAP_BRANDS].map((p) => [p.slug, p]));

/* A partner by slug, or null for anything that is not one. */
export function partnerBySlug(slug) {
  return BY_SLUG.get(String(slug ?? '')) ?? null;
}

/* The role in words, for a card or a lockup. */
export function roleTitle(p) {
  return (p && ROLE_TITLES[p.role]) || '';
}

/*
 * A link out to a partner, tagged so the partner sees WebFPV in their own
 * analytics: utm_source=webfpv and utm_medium=partner, and utm_content for
 * where on WebFPV it was clicked when the caller says. Anything already in
 * the address is kept, and a tag already there is left as the partner wrote
 * it. An address that does not parse comes back untouched rather than
 * throwing, because a card with an untagged link beats a card with none.
 */
export function partnerHref(href, content = '') {
  let url;
  try {
    url = new URL(String(href));
  } catch (e) {
    return String(href ?? '');
  }
  const tags = { utm_source: 'webfpv', utm_medium: 'partner' };
  if (content) {
    tags.utm_content = String(content);
  }
  for (const [k, v] of Object.entries(tags)) {
    if (!url.searchParams.has(k)) {
      url.searchParams.set(k, v);
    }
  }
  return url.href;
}
