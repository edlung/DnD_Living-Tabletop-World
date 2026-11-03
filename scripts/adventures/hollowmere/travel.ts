/**
 * The world map of The Bells of Hollowmere (docs/adr/0057-encounters-maps-loot.md §7–8): the
 * Northern Fens, a region whose picture is its map, the places pinned where its GPT-made map shows
 * them, and the routes between them with their miles, terrain and road — a day's ride from
 * Ravenford to Hollowmere, an hour or two by boat-pole to the chapel and the mill.
 */
export const REGION = 'fenlands';

/** Where each place lies on the region's picture, as fractions of its width and height. */
export const PINS: readonly { readonly placeId: string; readonly x: number; readonly y: number }[] =
  [
    { placeId: 'ravenford', x: 0.67, y: 0.68 },
    { placeId: 'willow-ford', x: 0.53, y: 0.49 },
    { placeId: 'hollowmere', x: 0.55, y: 0.27 },
    { placeId: 'drowned-chapel', x: 0.34, y: 0.1 },
    { placeId: 'sunken-mill', x: 0.76, y: 0.16 },
  ];

export const ROUTES: readonly {
  readonly fromId: string;
  readonly toId: string;
  readonly miles: number;
  readonly terrain: 'grassland' | 'swamp';
  readonly road: boolean;
}[] = [
  { fromId: 'ravenford', toId: 'willow-ford', miles: 14, terrain: 'grassland', road: true },
  { fromId: 'willow-ford', toId: 'hollowmere', miles: 16, terrain: 'grassland', road: true },
  { fromId: 'hollowmere', toId: 'sunken-mill', miles: 3, terrain: 'swamp', road: false },
  { fromId: 'hollowmere', toId: 'drowned-chapel', miles: 4, terrain: 'swamp', road: false },
  { fromId: 'sunken-mill', toId: 'drowned-chapel', miles: 5, terrain: 'swamp', road: false },
];
