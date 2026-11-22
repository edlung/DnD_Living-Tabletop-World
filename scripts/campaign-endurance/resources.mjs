import assert from 'node:assert/strict';
import { effectiveMaximum } from '../../packages/contracts/src/index.ts';
import { foldDrafts } from '../../packages/domain/src/kernel/provisional.ts';
import { decide } from '../../packages/domain/src/kernel/decide/decide.ts';
import { entryOf } from '../../packages/domain/src/items/records.ts';
import { entropyFor } from '../../packages/domain/src/combat/port.ts';
import { classResources, afterShortRest } from '../../packages/rules/src/features/resources.ts';
import {
  hitDice,
  hitDieRefusal,
  spendHitDie,
  wakeAfterShortRest,
  longRest,
  longRestRefusal,
} from '../../packages/rules/src/rest.ts';
import { near, walk, standing, support } from '../campaign-balance/tactics.mjs';
import { levelTo } from '../campaign-balance/scenes.mjs';

export const alive = (st, id) => st.entities.get(id)?.status === 'active';
const canAct = (st, id) =>
  alive(st, id) &&
  st.characterSheets.get(id).hitPoints.current > 0 &&
  !st.characterSheets.get(id).conditions.includes('unconscious');
export const ready = (st, party) => party.some((id) => canAct(st, id));
const dying = (sheet) => sheet.hitPoints.current === 0 && (sheet.deathSaves?.successes ?? 0) < 3;
function replaceSheets(state, change, party) {
  const sheets = new Map(state.characterSheets);
  for (const id of party) if (alive(state, id)) sheets.set(id, change(sheets.get(id), id));
  return { ...state, characterSheets: sheets };
}
export function snapshot(st, scene) {
  const party = scene.party.map((id, i) => {
    const s = st.characterSheets.get(id);
    return {
      seat: i + 1,
      key: scene.heroKeys?.[i] ?? id,
      name: st.entities.get(id).name,
      class: s.classes[0].classId,
      level: s.classes.reduce((n, c) => n + c.level, 0),
      alive: alive(st, id),
      hp: s.hitPoints.current,
      max: effectiveMaximum(s.hitPoints),
      ac: s.armorClass,
      slots: s.spellSlots.max.map((v, i) => v - (s.spellSlots.expended[i] ?? 0)),
      maxSlots: s.spellSlots.max,
      spells: [...new Set(s.spellcasting.flatMap((v) => v.spells))],
      hd: hitDice(s).reduce((n, p) => n + p.left, 0),
      sw: classResources(s).find((v) => v.resource === 'second-wind')?.left ?? 0,
      surge: classResources(s).find((v) => v.resource === 'action-surge')?.left ?? 0,
      ...(s.conditions.length ? { conditions: s.conditions } : {}),
      ...(s.deathSaves ? { death: s.deathSaves } : {}),
    };
  });
  const stock = {};
  for (const [id, v] of st.possessions)
    if (scene.party.includes(v.holderId) && v.quantity > 0) {
      const e = entryOf(v);
      if (
        e?.effect ||
        v.charges !== undefined ||
        /arrow|crossbow-bolt|bullet|ammunition/.test(v.catalogId ?? '')
      )
        stock[id] = {
          name: st.entities.get(id).name,
          catalog: v.catalogId,
          seat: scene.party.indexOf(v.holderId) + 1,
          qty: v.quantity,
          ...(v.charges !== undefined ? { charges: v.charges } : {}),
        };
    }
  return { party, stock };
}
export function useDecision(st, cmd, dice, effect) {
  const context = {
    state: st,
    history: [],
    authority: 'DM',
    actor: { kind: 'user', actorId: st.campaign.dmActorId },
    commandId: 'endurance-' + cmd.type + '-' + st.version,
    campaignId: st.campaign.campaignId,
  };
  const entropy =
    effect?.kind === 'heal-dice'
      ? Array.from({ length: effect.count }, () =>
          entropyFor(dice.roll(effect.sides), effect.sides),
        )
      : [];
  const decision = decide(context, {
    ...cmd,
    resolution: { ids: ['endurance-item-' + st.version], d20: null, entropy },
  });
  return decision.ok ? foldDrafts(context, cmd.type, decision.events) : null;
}
export function medicine(a, id, log) {
  const s = a.state.characterSheets.get(id);
  if (!s || s.hitPoints.current <= 0 || s.hitPoints.current > 0.55 * effectiveMaximum(s.hitPoints))
    return;
  for (const [itemId, v] of a.state.possessions) {
    if (v.holderId !== id || v.quantity <= 0) continue;
    const e = entryOf(v)?.effect;
    if (!['heal', 'heal-dice'].includes(e?.kind)) continue;
    const next = useDecision(a.state, { type: 'UseItem', characterId: id, itemId }, a.dice, e);
    if (next) {
      a.state = next;
      log.push({
        kind: 'use',
        hero: id,
        item: v.catalogId,
        heal: next.characterSheets.get(id).hitPoints.current - s.hitPoints.current,
      });
      return;
    }
  }
}
export function collectLoot(st, scene, dice, events) {
  const present = scene.party.filter((id) => canAct(st, id));
  if (!present.length) return st;
  for (const [itemId, p] of st.possessions) {
    const item = st.entities.get(itemId);
    if (
      !p.quantity ||
      p.holderId !== null ||
      !item ||
      item.placement?.locationId !== scene.start.locationId
    )
      continue;
    if (!['heal', 'heal-dice'].includes(entryOf(p)?.effect?.kind)) continue;
    const who = [...present].sort(
      (l, r) =>
        st.characterSheets.get(l).hitPoints.current / st.characterSheets.get(l).hitPoints.max -
        st.characterSheets.get(r).hitPoints.current / st.characterSheets.get(r).hitPoints.max,
    )[0];
    const next = useDecision(st, { type: 'TakeItem', characterId: who, itemId }, dice);
    if (next) {
      st = next;
      events.push({ kind: 'take', hero: who, item: p.catalogId, quantity: p.quantity });
    }
  }
  return st;
}
export function kerraTrade(st, scene, dice, events) {
  const who = scene.party
    .filter((id) => canAct(st, id))
    .sort(
      (a, b) =>
        st.characterSheets.get(a).hitPoints.current - st.characterSheets.get(b).hitPoints.current,
    )[0];
  if (!who) return st;
  for (const [itemId, p] of st.possessions) {
    if (p.holderId !== scene.foes[0] || p.catalogId !== 'srd-potion-of-healing' || !p.quantity)
      continue;
    const next = useDecision(
      st,
      { type: 'GiveItem', characterId: p.holderId, itemId, toHolderId: who, quantity: 1 },
      dice,
    );
    assert.ok(next, 'Kerra must be able to hand over an actual potion');
    events.push({ kind: 'trade', item: p.catalogId, hero: who, quantity: 1 });
    return next;
  }
  return st;
}
export function endFight(a, events, allowCare = true, outcome = null) {
  // Take turns for first aid and death saves. Foes separated by the closed
  // hatch or driven off the web have no opportunity attacks in this scene.
  a.disengagedFoes =
    (a.scene.key === 'cellar-rats' && ['win', 'withdrawn'].includes(outcome)) ||
    (a.scene.key === 'fissure-spinners' && ['win', 'burned'].includes(outcome));
  // The evacuees are already outside. Care for anyone left on the field
  // belongs to the subsequent scene and its actual rescuers.
  if (['prisoners-out', 'east-exit'].includes(outcome) || a.objectiveDetails?.taken?.length)
    allowCare = false;
  let turns = 0;
  while (allowCare && a.board && turns++ < 120) {
    const party = a.scene.party.filter((id) => alive(a.state, id) && a.record(id));
    const patients = party.filter(
      (id) => dying(a.state.characterSheets.get(id)) || a.state.characterSheets.get(id).knockedOut,
    );
    if (!patients.length || !party.some((id) => standing(a, id))) break;
    const id = a.current.entityId;
    if (party.includes(id) && standing(a, id)) {
      support(a, id);
      const patient = patients.find(
        (k) => dying(a.state.characterSheets.get(k)) || a.state.characterSheets.get(k).knockedOut,
      );
      if (patient) {
        walk(a, id, a.record(patient).position, 1);
        if (near(a, id, a.record(patient).position, 1))
          a.act(
            {
              type: 'TakeAction',
              combatantId: id,
              action: 'first-aid',
              targetId: patient,
              skill: 'medicine',
            },
            false,
          );
      }
    }
    if (a.board && a.current.entityId === id) a.act({ type: 'EndTurn', combatantId: id });
  }
  if (turns) events.push({ kind: 'after-fight-care', turns: turns - 1 });
  if (a.board) a.act({ type: 'EndCombat', encounterId: a.board.encounterId });
  assert.equal(a.state.encounter, null);
  return a.state;
}
// A stable character regains 1 HP after 1d4 hours (ADR 0048/0050).
export function travel(state, party, hours, dice, events) {
  state = replaceSheets(
    state,
    (s, id) => {
      if (s.hitPoints.current !== 0 || s.deathSaves?.successes !== 3) return s;
      const delay = dice.roll(4);
      if (delay > hours) return s;
      const rest = { ...s };
      delete rest.deathSaves;
      delete rest.knockedOut;
      events.push({ kind: 'woke', hero: id, delay });
      return {
        ...rest,
        hitPoints: { ...s.hitPoints, current: 1 },
        conditions: s.conditions.filter((c) => c !== 'unconscious'),
      };
    },
    party,
  );
  return { ...state, clock: state.clock + hours * 3600 };
}
export function takeRest(state, party, window, at, dice, events) {
  const before = state;
  state = replaceSheets(
    state,
    (sheet) => {
      if (dying(sheet)) return sheet;
      if (window.kind === 'long') {
        if (longRestRefusal(sheet, at) !== null) return sheet;
        return longRest(sheet, at);
      }
      sheet = wakeAfterShortRest(sheet) ?? sheet;
      for (const pool of hitDice(sheet))
        while (
          !hitDieRefusal(sheet, pool.sides) &&
          sheet.hitPoints.current < effectiveMaximum(sheet.hitPoints) * 0.9
        ) {
          const r = spendHitDie(sheet, pool.sides, dice.roll(pool.sides));
          assert.notEqual(typeof r, 'string');
          sheet = r.sheet;
        }
      return afterShortRest(sheet);
    },
    party,
  );
  events.push({
    kind: window.kind,
    after: window.after,
    hour: at / 3600,
    heroes: party.map((id) => {
      const b = before.characterSheets.get(id),
        s = state.characterSheets.get(id);
      return [
        id,
        s.hitPoints.current - b.hitPoints.current,
        b.spellSlots.expended.reduce((x, y) => x + y, 0) -
          s.spellSlots.expended.reduce((x, y) => x + y, 0),
        hitDice(b).reduce((n, p) => n + p.left, 0) - hitDice(s).reduce((n, p) => n + p.left, 0),
      ];
    }),
  });
  return { ...state, clock: at + (window.kind === 'long' ? 8 : 1) * 3600 };
}
export function stageNext(template, previous, level, unavailable = new Set()) {
  let st = previous ?? template.state;
  if (level)
    st = replaceSheets(
      st,
      (sheet) => (sheet.hitPoints.current > 0 ? levelTo(sheet, level) : sheet),
      template.party.filter((id) => !unavailable.has(id)),
    );
  const entities = new Map(st.entities);
  const combatants = template.start.combatants.filter(
    (c) => alive(st, c.entityId) && !unavailable.has(c.entityId),
  );
  for (const c of combatants) {
    const e = entities.get(c.entityId);
    entities.set(c.entityId, {
      ...e,
      placement: { locationId: template.start.locationId, since: st.clock },
    });
  }
  return {
    ...template,
    state: { ...st, entities },
    start: { ...template.start, combatants },
    party: template.party.filter((id) => alive(st, id) && !unavailable.has(id)),
    foes: combatants.filter((c) => c.side === 'hostile').map((c) => c.entityId),
  };
}
