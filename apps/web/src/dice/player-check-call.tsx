import { Requests } from './requests-log.tsx';
import { useDiceTable } from './table.tsx';

/** The current player's unanswered checks, beside the page they are already using. */
export function PlayerCheckCall() {
  const table = useDiceTable();
  if (
    table?.requests.status !== 'ready' ||
    !table.requests.value.requests.some((request) => request.status === 'open')
  )
    return null;
  return (
    <div className="player-check-call" aria-live="polite">
      <Requests characters={[]} />
    </div>
  );
}
