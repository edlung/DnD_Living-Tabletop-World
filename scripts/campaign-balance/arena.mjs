import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCombatEngine, hitPoints, vitalsOf } from '../../packages/combat/src/index.ts';
import {
  candidateReactions,
  currentCombatant,
  foldDrafts,
  openReactionWindow,
} from '../../packages/domain/src/index.ts';

const engine = createCombatEngine();
export function seeded(seed, observe) {
  return diceStream(createHash('sha256').update(seed).digest().readUInt32LE(), observe);
}
function diceStream(n, observe) {
  const counts = {};
  return {
    counts,
    fork() {
      return diceStream(n);
    },
    roll(sides) {
      n = (n + 0x6d2b79f5) >>> 0;
      let v = Math.imul(n ^ (n >>> 15), n | 1);
      v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
      counts[sides] = (counts[sides] ?? 0) + 1;
      const face = 1 + Math.floor((((v ^ (v >>> 14)) >>> 0) / 4294967296) * sides);
      observe?.(sides, face);
      return face;
    },
  };
}

export class Arena {
  constructor(scene, seed) {
    this.scene = scene;
    this.state = scene.state;
    this.dice = seeded(seed, scene.observeDie);
    this.stats = { moves: 0, attacks: 0, casts: 0, reactions: 0, saves: 0, actions: 0 };
    this.serial = 0;
    this.down = new Set();
    this.engineEnded = false;
    this.apply({ type: 'StartCombat', encounterId: 'battle-' + scene.key, ...scene.start });
  }
  get board() {
    return this.state.encounter;
  }
  get current() {
    return currentCombatant(this.board);
  }
  hp(id) {
    return hitPoints(vitalsOf(this.state, id)).current;
  }
  standing(id) {
    return this.state.entities.get(id)?.status === 'active' && this.hp(id) > 0;
  }
  record(id) {
    return this.board.combatants.find((c) => c.entityId === id);
  }
  apply(raw, required = true) {
    const commandId = this.scene.key + '-roll-' + ++this.serial;
    const context = {
      state: this.state,
      history: [],
      actor: { kind: 'user', actorId: this.state.campaign.dmActorId },
      campaignId: this.state.campaign.campaignId,
      authority: 'DM',
      commandId,
    };
    const decision = engine.decide(
      context,
      {
        ...raw,
        resolution: {
          ids: Array.from({ length: 16 }, (_, i) => commandId + '-' + i),
          d20: null,
          entropy: [],
        },
      },
      this.scene.commandDice?.(this, raw) ?? this.dice,
    );
    if (!decision.ok) {
      if (required)
        throw Error(this.scene.key + ' ' + raw.type + ' ' + JSON.stringify(decision.rejection));
      return false;
    }
    this.state = foldDrafts(context, raw.type, decision.events);
    this.scene.observeCommand?.(this, raw, decision.events);
    for (const event of decision.events) {
      if (/SavingThrow|DeathSave/.test(event.type)) this.stats.saves++;
      if (event.type === 'CombatEnded') this.engineEnded = true;
    }
    const counter = {
      Attack: 'attacks',
      CastSpell: 'casts',
      UseCreatureAction: 'actions',
      TakeAction: 'actions',
      MoveCombatant: 'moves',
      UseReaction: 'reactions',
    }[raw.type];
    if (counter) this.stats[counter]++;
    for (const id of this.scene.party) if (!this.standing(id)) this.down.add(id);
    return true;
  }
  act(cmd, required = true) {
    if (!this.apply(cmd, required)) return false;
    let window;
    while ((window = openReactionWindow(this.state))) {
      const candidate = window.candidates.find((c) => c.response === 'pending');
      assert.ok(candidate);
      const legal = candidateReactions(candidate);
      const reaction = [
        'opportunity-attack',
        'uncanny-dodge',
        'shield',
        'counterspell',
        'hellish-rebuke',
        'inspiration-reroll',
        'feather-fall',
      ].find((r) => legal.includes(r));
      const answer = { windowId: window.windowId, combatantId: candidate.entityId };
      const left = this.disengagedFoes && this.scene.foes.includes(candidate.entityId);
      if (left || !reaction || !this.apply({ type: 'UseReaction', ...answer, reaction }, false))
        this.apply({ type: 'DeclineReaction', ...answer });
    }
    return true;
  }
}
