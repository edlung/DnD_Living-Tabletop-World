/**
 * A book standing on the shelf (docs/adr/0075-book-interface.md §10): its campaign's own binding
 * (the theme's `--book-cover`, else the product's), its title on a paper label and, for a library
 * campaign, its cover picture set into the binding as a plate. The label under the book names it
 * for a screen reader and holds its buttons; the book itself is a large target for the pointer
 * that does what the label's first button does, so it is hidden from the keyboard and from
 * assistive technology rather than read twice. A library's book stands inside its own button
 * (`hub-library.tsx`), so everything here is phrasing content.
 */
export function ShelfBook({
  title,
  picture,
  onOpen,
}: {
  readonly title: string;
  /** The campaign's cover picture, for a book from the library. */
  readonly picture?: string;
  /** What pressing the book does; a book without one only stands there. */
  readonly onOpen?: (() => void) | undefined;
}) {
  const face = (
    <>
      {picture !== undefined && (
        <span className="shelf-book-plate">
          <img src={picture} alt="" loading="lazy" width={300} height={200} />
        </span>
      )}
      <span className="shelf-book-title">{title}</span>
    </>
  );
  return (
    <span className="shelf-stand">
      {onOpen ? (
        <button
          type="button"
          className="shelf-book"
          tabIndex={-1}
          aria-hidden="true"
          onClick={onOpen}
        >
          {face}
        </button>
      ) : (
        <span className="shelf-book" aria-hidden="true">
          {face}
        </span>
      )}
    </span>
  );
}
