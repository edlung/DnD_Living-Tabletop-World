import { carry, mission, task } from './mission.mjs';
import { fight, standing, walk } from './tactics.mjs';

// One disputed route per card. The GM sets unspecified furniture on the map before initiative.
// An arrow carries the same prop/person from its marker to the named destination.
const routes = {
  'ash-tithe': {
    'tithe-collectors': 'center>north',
    'cinder-hunt': 'center>south',
    'brazier-wardens': 'center>south',
  },
  'bellwether-hollow': {
    'orchard-folds': 'center>south',
    'mill-hushers': 'center>west',
    'belfry-shards': 'center>south',
  },
  'black-sun-forge': {
    'thread-watch': 'east',
    'clinker-collectors': 'center>west',
    'seal-carriers': 'center>west',
  },
  'lantern-mere': { 'porcelain-repeats': 'east', 'rain-steps': 'center', 'ink-shapes': 'center' },
  'last-ferryman': {
    'held-slip': 'east',
    'river-interception': 'center',
    'landing-cordon': 'east',
  },
  'moth-court': {
    'wash-wardens': 'center>north',
    'cabinet-guard': 'east>west',
    'yard-interception': 'center>east',
  },
  'thorn-abbey': {
    'root-waterbearers': 'center>south',
    'empty-cloaks': 'center>east',
    'briar-shields': 'center>south',
  },
  'winter-orchard': {
    'mirror-echoes': 'center>west',
    'lamp-wickers': 'center>east',
    'white-ushers': 'center>south',
  },
  'basalt-bloom': {
    'bank-skippers': 'center>north',
    'draft-moths': 'center>south',
    'mica-springers': 'J5>west',
  },
  'dragon-retirement': {
    'scree-grabbers': 'I6>west',
    'yellow-cloak-toll': 'west',
    'applause-stewards': 'east',
  },
  'dungeon-sanctuary': {
    'chalk-goats': 'M6',
    'reed-geese': 'B6>M6',
    'courtesy-drill': 'B5>M6 B7>M6',
  },
  'familiar-school': {
    'yard-wardens': 'north',
    'canvas-wardens': 'north>west',
    'gate-wardens': 'west',
  },
  'impossible-fair': {
    'unasked-brushes': 'center>east',
    'paper-dandies': 'center>west',
    'crosswind-curls': 'center>east',
  },
  'small-banner': {
    'ribbon-holders': 'center>east',
    'lid-dispute': 'center>south',
    'paper-crabs': 'center>east',
  },
  'storm-kitchen': {
    'shelf-clickers': 'F5>east H6>east I5>east',
    'fold-nibblers': 'center>east',
    'gust-knots': 'center>north',
  },
  'three-magicless-days': {
    'ribbon-goats': 'N3',
    'ribbon-whirlers': 'N9',
    'cardboard-knights': 'spar',
  },
  'unwritten-god': {
    'ledge-swallows': 'center>north',
    'quarry-watch': 'center',
    'reef-claws': 'east',
  },
  'cedar-tournament': { 'stone-circle': 'spar', 'ribbon-arc': 'spar', 'bowl-cross': 'spar' },
  'silent-frequency': {
    'crate-standoff': 'center>west',
    'terrace-standoff': 'east',
    'papers-standoff': 'center>west',
  },
  'paper-sea': { 'epic-folds': 'center', 'comic-folds': 'center', 'final-folds': 'east' },
  'root-city': {
    'screen-match': 'west>east',
    'support-trial': 'west>east',
    'deck-rehearsal': 'center>east',
  },
  'copper-canyon': { 'plush-summit': 'spar', 'ring-bearer-dance': 'spar', 'goose-guard': 'spar' },
  'lantern-court': {
    'coal-pickets': 'center>west',
    'glass-moths': 'center>west',
    'wax-arguments': 'west',
  },
  'dream-orchestra': {
    'quarry-echoes': 'west>east',
    'tide-splashes': 'west>east',
    'reprise-arcs': 'center>south',
  },
  'red-dune-post': {
    'parcel-parade': 'west>east',
    'petal-ushers': 'west>east',
    'banner-runners': 'west>east',
  },
  'rain-bureau': {
    'cloak-guards': 'east',
    'frame-doubles': 'center',
    'umbrella-extras': 'center>east',
  },
  'museum-midnight': {
    'paper-ushers': 'north',
    'perfect-actors': 'north',
    'brass-movers': 'north',
  },
  'absent-voters': {
    'courtyard-obstruction': 'center>west',
    'hall-dispute': 'center>west',
    'crossing-crowd': 'center',
  },
  'counterfeit-spring': {
    'crowded-doorway': 'west',
    'frame-passage': 'center',
    'closed-curtain': 'west',
  },
  'false-verdict': {
    'yard-passage': 'center>west',
    'archive-frame': 'center>west',
    'hall-door': 'center>west',
  },
  'last-round': {
    'yard-pressure': 'center>west',
    'repair-dispute': 'center',
    'pavilion-push': 'center>west',
  },
  'quiet-exchange': {
    'narrow-aisle': 'west',
    'held-parcel': 'center',
    'uninvited-listeners': 'center>west',
  },
  'room-608': {
    'linen-dispute': 'center>west',
    'cabinet-pressure': 'center',
    'audience-exit': 'center>west',
  },
  'seventh-negative': {
    'yard-cart': 'center>west',
    'gate-pressure': 'center>west',
    'closed-set-pressure': 'center>west',
  },
  'strike-fund': {
    'yard-pressure': 'west',
    'press-doorway': 'center>west',
    'store-exit': 'center>west',
  },
  'white-ash': {
    'threshold-keepers': 'center>west',
    'custody-pressure': 'center>west',
    'gallery-pressure': 'center>east',
  },
};
function spar(a) {
  // Agree on a complete exchange, then any participant signals the end of the demonstration.
  return {
    soft: true,
    turn(id, side) {
      fight(a, id, side === 'party' ? a.scene.foes : a.scene.party, { soft: true });
      return true;
    },
    endRound: (r) => (r >= 2 ? 'win' : null),
    result: () => (a.scene.foes.some((k) => standing(a, k)) ? null : 'win'),
  };
}
export function openScene(a) {
  const route = routes[a.scene.slug]?.[a.scene.key];
  if (!route) return null;
  if (route === 'spar') return spar(a);
  const jobs = route.split(' ').map((leg) => {
    const [at, to] = leg.split('>');
    return to ? carry(at, to) : task(at);
  });
  const exit = {
    'orchard-folds': 'south',
    'yellow-cloak-toll': 'west',
    'river-interception': 'east',
  }[a.scene.key];
  const decoy = a.scene.key === 'orchard-folds';
  return mission(a, jobs, {
    soft: true,
    exit,
    foe: decoy
      ? (arena, id, api) => {
          const cup = api.goals[0];
          if (!cup.done) return false;
          walk(arena, id, cup.to, 1);
          return true;
        }
      : undefined,
  });
}
