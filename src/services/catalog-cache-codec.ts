// Fork: a whole movie catalog stored as one object per item outgrows the
// TV's 48 MB storage quota, because every item repeats its field names and
// account id and most poster URLs share a long start. Stored by column, the
// field names go, a field equal on every item is kept once, and a URL is
// kept as its start's index plus the rest.

export const PACKED_CATALOG_FORMAT = 'catalog-columns-v1';

type Cell = string | number;

interface PackedColumn {
  key: string;
  /** Set when every item has this value. */
  same?: Cell;
  /** One cell per item; null where the item has no such field. */
  values?: Array<Cell | null>;
  /** For split URL columns: the index into `starts` per item, -1 for none. */
  start?: number[];
}

export interface PackedCatalog {
  format: typeof PACKED_CATALOG_FORMAT;
  length: number;
  starts: string[];
  columns: PackedColumn[];
}

export function isPackedCatalog(value: unknown): value is PackedCatalog {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (value as { format?: unknown }).format === PACKED_CATALOG_FORMAT;
}

function isCell(value: unknown): value is Cell {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

// URL starts end at the last slash; shorter values are not worth splitting.
function splitAt(value: string): number {
  if (value.length < 24 || value.indexOf('://') < 0) return -1;
  return value.lastIndexOf('/') + 1;
}

/**
 * The list stored by column, or the list itself when it holds anything but
 * flat objects of strings and numbers.
 */
export function packCatalog(items: unknown): unknown {
  if (!Array.isArray(items) || items.length < 2) return items;
  const keys: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as Record<string, unknown> | null;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return items;
    for (const key in item) {
      if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
      const value = item[key];
      if (value === undefined) continue;
      if (!isCell(value)) return items;
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  const starts: string[] = [];
  const startIds = new Map<string, number>();
  const columns: PackedColumn[] = keys.map((key) => {
    const values: Array<Cell | null> = new Array(items.length);
    let same: Cell | null | undefined;
    let allSame = true;
    let urls = 0;
    for (let i = 0; i < items.length; i++) {
      const raw = (items[i] as Record<string, unknown>)[key];
      const value = isCell(raw) ? raw : null;
      values[i] = value;
      if (i === 0) same = value;
      else if (value !== same) allSame = false;
      if (typeof value === 'string' && splitAt(value) > 0) urls++;
    }
    if (allSame && same !== null && same !== undefined) return { key, same };
    if (urls * 4 < items.length) return { key, values };
    const start: number[] = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
      const value = values[i];
      const at = typeof value === 'string' ? splitAt(value) : -1;
      if (at <= 0) {
        start[i] = -1;
        continue;
      }
      const head = (value as string).slice(0, at);
      let id = startIds.get(head);
      if (id === undefined) {
        id = starts.length;
        starts.push(head);
        startIds.set(head, id);
      }
      start[i] = id;
      values[i] = (value as string).slice(at);
    }
    return { key, values, start };
  });
  return { format: PACKED_CATALOG_FORMAT, length: items.length, starts, columns } satisfies PackedCatalog;
}

/** The list as it was packed: same items, same field order. */
export function unpackCatalog(packed: PackedCatalog): Array<Record<string, Cell>> {
  const items: Array<Record<string, Cell>> = new Array(packed.length);
  for (let i = 0; i < packed.length; i++) items[i] = {};
  for (const column of packed.columns) {
    const { key, same, values, start } = column;
    for (let i = 0; i < packed.length; i++) {
      if (same !== undefined) {
        items[i][key] = same;
        continue;
      }
      const value = values ? values[i] : null;
      if (value === null || value === undefined) continue;
      const head = start && start[i] >= 0 ? packed.starts[start[i]] : '';
      items[i][key] = head ? head + String(value) : value;
    }
  }
  return items;
}

/** A stored catalog value as the readers expect it. */
export function readCatalogData(stored: unknown): unknown {
  return isPackedCatalog(stored) ? unpackCatalog(stored) : stored;
}
