import type { SrdBlock } from '@ltw/contracts';
import { useRef } from 'react';

import { useScrollEdges } from '../visual/scroll-edges.ts';

/**
 * The SRD's rules text in its blocks (docs/adr/0055-rules-reference-and-toolbox.md §1–2): a
 * paragraph opens with its run-in head in bold; bulleted items make one list; a list of names links
 * those that are entries of the glossary; a table scrolls sideways in its own box, faded at the
 * edge that hides more. The words keep their own language (`lang`), as the SRD gives them.
 */
export function SrdBlocks({
  blocks,
  language,
  entryOf,
  onEntry,
}: {
  readonly blocks: readonly SrdBlock[];
  readonly language: 'en' | 'ru';
  /** The glossary entry a name is, if it is one. */
  readonly entryOf?: (name: string) => string | null;
  readonly onEntry?: (entryId: string) => void;
}) {
  const groups: (SrdBlock | Extract<SrdBlock, { kind: 'item' }>[])[] = [];
  for (const block of blocks) {
    const last = groups[groups.length - 1];
    if (block.kind === 'item' && Array.isArray(last)) last.push(block);
    else groups.push(block.kind === 'item' ? [block] : block);
  }
  return (
    <div className="srd-blocks" lang={language}>
      {groups.map((group, index) => {
        if (Array.isArray(group))
          return (
            <ul key={index} className="srd-items">
              {group.map((item, at) => (
                <li key={at}>
                  <Words head={item.head} text={item.text} />
                </li>
              ))}
            </ul>
          );
        switch (group.kind) {
          case 'paragraph':
            return (
              <p key={index}>
                <Words head={group.head} text={group.text} />
              </p>
            );
          case 'item':
            return null;
          case 'names':
            return (
              <ul key={index} className="srd-names">
                {group.names.map((name) => {
                  const entryId = entryOf?.(name) ?? null;
                  return (
                    <li key={name}>
                      {entryId !== null && onEntry ? (
                        <button
                          type="button"
                          className="srd-link"
                          onClick={() => {
                            onEntry(entryId);
                          }}
                        >
                          {name}
                        </button>
                      ) : (
                        name
                      )}
                    </li>
                  );
                })}
              </ul>
            );
          case 'table':
            return <SrdTable key={index} table={group} />;
        }
      })}
    </div>
  );
}

/** A run-in head closes with a period, a label ("Trigger:") with its own colon. */
function Words({ head, text }: { readonly head: string | null; readonly text: string }) {
  if (head === null) return text;
  return (
    <>
      <strong className="srd-head">{head.endsWith(':') ? head : `${head}.`}</strong> {text}
    </>
  );
}

function SrdTable({ table }: { readonly table: Extract<SrdBlock, { kind: 'table' }> }) {
  const box = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(box, `${String(table.rows.length)}|${table.title ?? ''}`);
  return (
    <figure className="srd-table">
      <div
        ref={box}
        className="srd-table-box"
        // A table wider than the sheet scrolls: the keyboard reaches it too.
        tabIndex={edges.before || edges.after ? 0 : undefined}
        role={edges.before || edges.after ? 'region' : undefined}
        aria-label={
          edges.before || edges.after ? (table.title ?? table.columns.join(', ')) : undefined
        }
        data-more-before={edges.before || undefined}
        data-more-after={edges.after || undefined}
      >
        <table>
          {table.title && <caption>{table.title}</caption>}
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, at) => (
                  <td key={at}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.notes.length > 0 && (
        <figcaption>
          {table.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
