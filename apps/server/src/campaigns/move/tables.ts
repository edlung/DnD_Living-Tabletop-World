/**
 * What a campaign's move carries (docs/adr/0061-local-mode.md §5), table by table, in the order an
 * import writes them (a table after the ones it refers to). Every table that names a campaign is
 * either here or in `LEFT_BEHIND` with its reason: `tables.integration.test.ts` holds the schema
 * to that, so a new table is a decision, never a silent loss.
 *
 * How a returning package meets the copy that stayed (the campaign was away, so that copy is
 * older):
 * - `history`: the copy's rows must be the package's first rows; the rest is appended.
 * - `append`: rows never change: missing ones are added, a changed one refuses the import, one only
 *   the copy has stays (it was written as the move was cut) and is reported.
 * - `record`: rows change one way (an invitation used or revoked): missing ones are added, changed
 *   ones updated where the table's triggers allow it, none deleted.
 * - `state`: the table's present state: the copy's rows become the package's (changed or missing
 *   ones replaced, ones the package lacks deleted).
 * - `accounts`: people, shared with other campaigns: merged (`import-accounts.ts`), never deleted.
 */
export type MoveKind = 'history' | 'append' | 'record' | 'state' | 'accounts';

export interface MovedTable {
  readonly name: string;
  readonly kind: MoveKind;
  /** The campaign's rows: a condition on `$1`, the campaign. */
  readonly where: string;
  /** The primary key's columns. */
  readonly key: readonly string[];
  /** The export's order (a row after the rows it refers to). */
  readonly order: string;
  /** Rows a fetch reads: fewer where a row may be large (pictures, music). */
  readonly batch: number;
  /**
   * How an import checks that a package's row is the campaign's: its column names the campaign,
   * or (`via`) appears in that column of another moved table's rows in the same package.
   */
  readonly owner: { readonly column: string; readonly via?: string };
}

const campaign = 'campaign_id = $1';
const stream = 'stream_id = $1';
const byCampaign = { column: 'campaign_id' };
const byStream = { column: 'stream_id' };
const ROWS = 500;

export const MOVED_TABLES: readonly MovedTable[] = [
  {
    name: 'ltw_event_streams',
    kind: 'history',
    where: stream,
    key: ['stream_id'],
    order: 'stream_id',
    batch: 1,
    owner: byStream,
  },
  {
    name: 'ltw_commands',
    kind: 'history',
    where: stream,
    key: ['command_id'],
    order: 'first_sequence',
    batch: ROWS,
    owner: byStream,
  },
  {
    name: 'ltw_events',
    kind: 'history',
    where: stream,
    key: ['stream_id', 'sequence'],
    order: 'sequence',
    batch: ROWS,
    owner: byStream,
  },
  {
    name: 'ltw_dm_substitutions',
    kind: 'append',
    where: campaign,
    key: ['campaign_id', 'command_id'],
    order: 'command_id',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_authoring_revisions',
    kind: 'append',
    where: campaign,
    key: ['proposal_id', 'revision'],
    order: 'proposal_id, revision',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_asset_contents',
    kind: 'append',
    where: campaign,
    key: ['campaign_id', 'content_hash'],
    order: 'content_hash',
    batch: 4,
    owner: byCampaign,
  },
  {
    name: 'ltw_auth_invitations',
    kind: 'record',
    where: campaign,
    key: ['invitation_id'],
    order: 'created_at, invitation_id',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_accounts',
    kind: 'accounts',
    where: 'account_id IN (SELECT account_id FROM ltw_account_seats WHERE campaign_id = $1)',
    key: ['account_id'],
    order: 'account_id',
    batch: ROWS,
    owner: { column: 'account_id', via: 'ltw_account_seats' },
  },
  {
    name: 'ltw_account_seats',
    kind: 'state',
    where: campaign,
    key: ['account_id', 'campaign_id'],
    order: 'account_id',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_table_rolls',
    kind: 'append',
    where: campaign,
    key: ['campaign_id', 'roll_id'],
    order: 'position',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_roll_confirmations',
    kind: 'append',
    where: campaign,
    key: ['campaign_id', 'roll_id'],
    order: 'roll_id',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_check_requests',
    kind: 'state',
    where: campaign,
    key: ['campaign_id', 'request_id'],
    order: 'position',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_rests',
    kind: 'state',
    where: campaign,
    key: ['campaign_id', 'rest_id'],
    order: 'rest_id',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_chat_messages',
    kind: 'append',
    where: campaign,
    key: ['campaign_id', 'message_id'],
    order: 'position',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_handouts',
    kind: 'append',
    where: campaign,
    key: ['campaign_id', 'handout_id'],
    order: 'position',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_dm_notes',
    kind: 'state',
    where: campaign,
    key: ['campaign_id', 'note_id'],
    order: 'note_id',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_table_states',
    kind: 'state',
    where: campaign,
    key: ['campaign_id'],
    order: 'campaign_id',
    batch: 1,
    owner: byCampaign,
  },
  {
    name: 'ltw_table_marks',
    kind: 'state',
    where: campaign,
    key: ['campaign_id', 'mark_id'],
    order: 'mark_id',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_table_mark_settings',
    kind: 'state',
    where: campaign,
    key: ['campaign_id'],
    order: 'campaign_id',
    batch: 1,
    owner: byCampaign,
  },
  {
    name: 'ltw_display_casts',
    kind: 'state',
    where: campaign,
    key: ['campaign_id'],
    order: 'campaign_id',
    batch: 1,
    owner: byCampaign,
  },
  {
    name: 'ltw_table_links',
    kind: 'record',
    where: campaign,
    key: ['link_id'],
    order: 'link_id',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_table_link_seats',
    kind: 'state',
    where: 'link_id IN (SELECT link_id FROM ltw_table_links WHERE campaign_id = $1)',
    key: ['link_id', 'invitation_id'],
    order: 'link_id, invitation_id',
    batch: ROWS,
    owner: { column: 'link_id', via: 'ltw_table_links' },
  },
  {
    name: 'ltw_saved_encounters',
    kind: 'state',
    where: campaign,
    key: ['campaign_id', 'encounter_id'],
    order: 'encounter_id',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_dm_library',
    kind: 'state',
    where: campaign,
    key: ['campaign_id', 'entry_id'],
    order: 'entry_id',
    batch: ROWS,
    owner: byCampaign,
  },
  {
    name: 'ltw_music_tracks',
    kind: 'state',
    where: campaign,
    key: ['campaign_id', 'track_id'],
    order: 'added_at, track_id',
    batch: 1,
    owner: byCampaign,
  },
];

/** The tables that name a campaign and stay with their server, and why. */
export const LEFT_BEHIND: Readonly<Record<string, string>> = {
  ltw_auth_sessions: "this server's sign-ins: everyone signs in again where the campaign plays",
  ltw_displays: 'devices: a table screen pairs again with the server it shows',
  ltw_ai_requests: 'AI spending is recorded where it was spent',
  ltw_ai_attempts: 'AI spending is recorded where it was spent',
  ltw_ai_traces: 'AI spending is recorded where it was spent',
  ltw_ai_evaluation_runs: 'AI evaluations belong to the operator of this server',
  ltw_image_charges: 'picture spending is recorded where it was spent',
  ltw_workshop_campaign_activations: 'a campaign published from the workshop does not move yet',
  ltw_campaign_initial_content: 'a campaign published from the workshop does not move yet',
  ltw_campaign_moves: "this server's own record of what moved away and back",
};

export const movedTable = (name: string): MovedTable | undefined =>
  MOVED_TABLES.find((table) => table.name === name);
