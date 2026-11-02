import type {
  CastResponse,
  CheckRequestsResponse,
  ChronicleListResponse,
  DisplayJoinResponse,
  EncounterResponse,
  EntityPresentationResponse,
  EntityRef,
  RollFeedResponse,
  ScenePresentationResponse,
} from '@ltw/contracts';
import { useT } from '@ltw/ui';
import { useCallback, useRef } from 'react';

import type { WorldApi } from '../api/client.ts';
import { useResource } from '../api/resource.ts';
import { Board } from '../combat/board/board.tsx';
import { NARROW, WIDE, useMedia } from '../combat/board/board-view.ts';
import { InitiativeStrip } from '../combat/hud/initiative-strip.tsx';
import { useCombatantLabels } from '../combat/labels.ts';
import { formatWorldTime } from '../dm/world-time.ts';
import { TABLE_PATH } from '../session/invitation-link.ts';
import { useApprovedImage } from '../visual/approved-images.ts';
import { Glyph } from '../visual/glyph.tsx';
import { phaseGlyph, weatherGlyph } from '../visual/glyph-map.ts';
import { QrCode } from '../visual/qr-code.tsx';
import { textureUrl } from '../visual/ui-kit.ts';
import { useRereadOn } from '../world/use-world-data.ts';
import { WaitingList } from './waiting-strip.tsx';

/**
 * What the table's screen shows, by the DM's cast (docs/adr/0042-table-display.md §3): each view
 * reads the campaign's usual routes in the PARTY perspective, so anything the party does not know
 * shows nothing, and follows the live signal. Pictures are approved world images or the UI kit;
 * nothing is invented; no WebGL (a weak TV browser shows everything).
 */
interface Props {
  readonly api: WorldApi;
  readonly cast: CastResponse;
  readonly directory: readonly EntityRef[];
  readonly refresh: number;
  readonly campaignName: string;
}

export function CastView(props: Props) {
  const { cast } = props.cast;
  switch (cast.kind) {
    case 'scene':
      return <SceneCast {...props} place={props.cast.place ?? null} />;
    case 'battlefield':
      return <BattleCast {...props} zoom={cast.zoom} focus={cast.focus} />;
    case 'dice':
      return <DiceCast {...props} />;
    case 'title':
      return <TitleCard title={cast.title} subtitle={cast.subtitle} />;
    case 'chronicle':
      return <ChronicleCast {...props} />;
    case 'picture':
      return <PictureCast {...props} entityId={cast.entityId} />;
    case 'join':
      return <JoinCast {...props} />;
    case 'blank':
      return <div className="display-blank" aria-label={props.campaignName} role="img" />;
  }
}

/**
 * A read of one route, kept fresh by the live signal; null until it answers. The loader names the
 * route's response type; the key names the read (a new key, a new read).
 */
function useRead<T>(
  props: Props,
  key: string,
  load: (api: WorldApi, signal: AbortSignal) => Promise<T>,
): T | null {
  const { api, refresh } = props;
  const latest = useRef(load);
  latest.current = load;
  const loader = useCallback((signal: AbortSignal) => latest.current(api, signal), [api]);
  const read = useResource(key, loader);
  useRereadOn(refresh, read.reread);
  return read.resource.status === 'ready' ? read.resource.value : null;
}

const nameIn = (directory: readonly EntityRef[], id: string | null) =>
  directory.find((entity) => entity.entityId === id)?.name ?? null;

function SceneCast(props: Props & { readonly place: string | null }) {
  const t = useT();
  const place = props.place ?? '';
  const scene = useRead(props, `scene:${place}`, (api, signal) =>
    api.get<ScenePresentationResponse>(`locations/${encodeURIComponent(place)}/scene`, signal),
  );
  const art = useApprovedImage(scene?.location.image ?? null);
  const name = nameIn(props.directory, props.place);
  if (props.place === null || !scene || name === null) {
    return <TitleCard title={props.campaignName} subtitle="" />;
  }
  const party = scene.present
    .filter((entity) => entity.kind === 'character')
    .map((entity) => nameIn(props.directory, entity.entityId))
    .filter((who): who is string => who !== null);
  // Without an approved picture, the neutral mist (it never stands in for the place), and once the
  // scene says it has none, the note the world screen shows too.
  return (
    <section className="display-scene" aria-label={name}>
      <img
        className="display-art"
        src={art ?? textureUrl('scene-fallback')}
        alt=""
        data-approved={art !== null}
      />
      <div className="display-scrim display-scrim--low" aria-hidden="true" />
      {!scene.location.image && <p className="display-note">{t('No approved image yet')}</p>}
      <header className="display-caption">
        <h1>{name}</h1>
        <p>
          <span>{formatWorldTime(scene.worldTime, t)}</span>
          <span>
            <Glyph name={phaseGlyph(scene.phase)} />
            {t(scene.phase)}
          </span>
          {scene.location.weather && (
            <span>
              <Glyph name={weatherGlyph(scene.location.weather)} />
              {t(scene.location.weather)}
            </span>
          )}
        </p>
        {party.length > 0 && <p className="display-party">{party.join(' · ')}</p>}
      </header>
    </section>
  );
}

function BattleCast(props: Props & { readonly zoom: number; readonly focus: string | null }) {
  const t = useT();
  const read = useRead(props, 'encounter', (api, signal) =>
    api.get<EncounterResponse>('encounter', signal),
  );
  // The fight's place, when the party knows it: its approved portraits, figures and battle map.
  const place = props.cast.place ?? null;
  const scene = useRead(props, `battle-scene:${place ?? ''}`, (api, signal) =>
    place === null
      ? Promise.resolve(null)
      : api.get<ScenePresentationResponse>(`locations/${encodeURIComponent(place)}/scene`, signal),
  );
  const encounter = read?.encounter ?? null;
  if (!encounter) {
    return <TitleCard title={t('No fight right now')} subtitle={props.campaignName} />;
  }
  return <Battle encounter={encounter} zoom={props.zoom} focus={props.focus} scene={scene} />;
}

function Battle({
  encounter,
  zoom,
  focus,
  scene,
}: {
  readonly encounter: NonNullable<EncounterResponse['encounter']>;
  readonly zoom: number;
  readonly focus: string | null;
  readonly scene: ScenePresentationResponse | null;
}) {
  const t = useT();
  const labelOf = useCombatantLabels(encounter);
  // Tilted like a table on a wide screen, flat on a small one (as on the world screen).
  const wide = useMedia(WIDE);
  const narrow = useMedia(NARROW);
  const present = (id: string) => scene?.present.find((one) => one.entityId === id);
  const imageOf = (id: string) => present(id)?.image ?? null;
  const figureOf = (id: string) => present(id)?.figure ?? null;
  // The battle map while the place's presentation lists the combatants (ADR 0035 §4).
  const fought =
    scene?.present.some((one) =>
      encounter.combatants.some((entry) => entry.entity.entityId === one.entityId),
    ) ?? false;
  const kept = focus ?? encounter.currentCombatantId;
  const centre = encounter.combatants.find((entry) => entry.entity.entityId === kept)?.position;
  return (
    <section className="display-battle" aria-label={t('The battlefield')}>
      <InitiativeStrip encounter={encounter} actorId={null} imageOf={imageOf} />
      {/* A picture of the fight: nothing on it is pressed. */}
      <div className="display-board" inert>
        <Board
          encounter={encounter}
          labelOf={labelOf}
          currentCombatantId={encounter.currentCombatantId}
          selfId={null}
          selected={null}
          path={[]}
          affected={new Set()}
          imageOf={imageOf}
          figureOf={figureOf}
          battleMap={fought && scene ? scene.location.battleMap : null}
          centreOn={centre ?? null}
          view={{
            mode: wide ? 'tilted' : 'flat',
            zoom,
            narrow,
            choose: () => undefined,
            zoomIn: null,
            zoomOut: null,
            maxCell: 140,
          }}
          onPick={() => undefined}
        />
      </div>
    </section>
  );
}

function DiceCast(props: Props) {
  const t = useT();
  const feed = useRead(props, 'rolls', (api, signal) => api.get<RollFeedResponse>('rolls', signal));
  const asked = useRead(props, 'asked', (api, signal) =>
    api.get<CheckRequestsResponse>('check-requests', signal),
  );
  const latest = (feed?.rolls ?? [])
    .filter((roll) => !roll.hidden)
    .slice(-3)
    .reverse();
  const waiting = (asked?.requests ?? []).filter((request) => request.status === 'open');
  return (
    <section className="display-dice" aria-label={t('The table’s rolls')}>
      <WaitingList waiting={waiting} directory={props.directory} />
      {latest.length === 0 ? (
        <p className="display-quiet">{t('No rolls yet.')}</p>
      ) : (
        <ol className="display-rolls">
          {latest.map((roll, index) => (
            <li key={roll.rollId} className={index === 0 ? 'is-latest' : undefined}>
              <span className="display-roller">{roll.roller?.name ?? t('The DM')}</span>
              <span className="display-total">
                {roll.groups.reduce((sum, group) => sum + group.total, 0)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function TitleCard({
  title,
  subtitle,
}: {
  readonly title: string;
  readonly subtitle: string;
}) {
  return (
    <section className="display-title" aria-label={title}>
      <img className="display-art" src={textureUrl('brand-keyart')} alt="" />
      <div className="display-scrim" aria-hidden="true" />
      <div className="display-title-text">
        <h1>{title}</h1>
        {subtitle !== '' && <p>{subtitle}</p>}
      </div>
    </section>
  );
}

function ChronicleCast(props: Props) {
  const t = useT();
  const list = useRead(props, 'chronicle', (api, signal) =>
    api.get<ChronicleListResponse>('chronicle', signal),
  );
  const chapter = list?.chapters.at(-1) ?? null;
  if (!chapter)
    return <TitleCard title={t('The Chronicle is still empty')} subtitle={props.campaignName} />;
  return (
    <section className="display-chronicle" aria-label={chapter.title}>
      <article>
        <h1>{chapter.title}</h1>
        {chapter.prose.paragraphs.slice(0, 4).map((paragraph, index) => (
          <p key={index}>{paragraph.text}</p>
        ))}
      </article>
    </section>
  );
}

function PictureCast(props: Props & { readonly entityId: string }) {
  const path = `entities/${encodeURIComponent(props.entityId)}/presentation`;
  const shown = useRead(props, `picture:${path}`, (api, signal) =>
    api.get<EntityPresentationResponse>(path, signal),
  );
  const art = useApprovedImage(shown?.presentation.image ?? null);
  const name = nameIn(props.directory, props.entityId);
  if (!art) return <div className="display-blank" role="img" aria-label={props.campaignName} />;
  return (
    <figure className="display-picture">
      <img src={art} alt={name ?? ''} />
      {name && <figcaption>{name}</figcaption>}
    </figure>
  );
}

function JoinCast(props: Props) {
  const t = useT();
  const join = useRead(props, 'join', (api, signal) =>
    api.get<DisplayJoinResponse>('display/join', signal, false),
  );
  const chronicle = useRead(props, 'chronicle', (api, signal) =>
    api.get<ChronicleListResponse>('chronicle', signal),
  );
  const last = chronicle?.chapters.at(-1) ?? null;
  return (
    <section className="display-join" aria-label={t('Join the table')}>
      <div className="display-join-card">
        <h1>{props.campaignName}</h1>
        {join?.link && join.code ? (
          <>
            <QrCode text={join.link} label={t('QR code to join the table')} />
            <p>{t('Scan with your phone, sign in, and choose your character.')}</p>
            <p className="display-code">{`${join.code.slice(0, 4)} ${join.code.slice(4)}`}</p>
            <p className="display-hint">
              {t('Or open {address} and type this code.', {
                address: `${window.location.host}${TABLE_PATH}`,
              })}
            </p>
          </>
        ) : (
          <p>{t('The DM has not opened the table to join yet.')}</p>
        )}
      </div>
      {last && (
        <aside className="display-recap">
          <h2>{t('Last time')}</h2>
          <p className="display-recap-title">{last.title}</p>
          {last.prose.paragraphs[0] && <p>{last.prose.paragraphs[0].text}</p>}
        </aside>
      )}
    </section>
  );
}
