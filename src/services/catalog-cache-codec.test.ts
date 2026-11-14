import { describe, expect, it } from 'vitest';
import { isPackedCatalog, packCatalog, readCatalogData, unpackCatalog } from './catalog-cache-codec';
import { serializedBytes } from '../utils/serialized-bytes';
import { sameCatalogItems } from '../utils/catalog-items';

function movies(count: number): Array<Record<string, string | number>> {
  return Array.from({ length: count }, (_, i) => ({
    accountId: 'acc-1234567890abcd',
    streamId: String(100000 + i),
    name: `Film number ${i}`,
    poster: i % 7 === 0 ? '' : `https://image.tmdb.org/t/p/w600_and_h900_bestv2/poster${i}.jpg`,
    rating: String(i % 10),
    categoryId: String(i % 40),
    containerExtension: i % 3 ? 'mkv' : 'mp4',
    ...(i % 5 ? { addedAt: 1700000000000 + i } : {}),
    ...(i % 4 ? {} : { year: 1990 + (i % 30) }),
  }));
}

describe('catalog cache codec', () => {
  it('gives back the same items after packing', () => {
    const items = movies(500);
    const packed = packCatalog(items);
    expect(isPackedCatalog(packed)).toBe(true);
    const back = unpackCatalog(packed as never);
    expect(sameCatalogItems(back, items)).toBe(true);
    expect(back).toEqual(items);
  });

  it('stores a movie list in well under two thirds of its size', () => {
    const items = movies(5000);
    expect(serializedBytes(packCatalog(items))).toBeLessThan(serializedBytes(items) * 0.6);
  });

  it('keeps URLs that are not split, numbers in URL columns, and empty values', () => {
    const items = [
      { id: 'a', url: 'https://cdn.example.com/a/b/1.jpg' },
      { id: 'b', url: 7 },
      { id: 'c', url: 'short' },
      { id: 'd', url: 'https://cdn.example.com/a/b/' },
      { id: 'e' },
    ];
    expect(unpackCatalog(packCatalog(items) as never)).toEqual(items);
  });

  it('leaves lists it cannot pack as they are', () => {
    const nested = [{ id: '1', tags: ['x'] }, { id: '2', tags: [] }];
    expect(packCatalog(nested)).toBe(nested);
    const marker = { code: 'empty', retryAt: 1 };
    expect(packCatalog(marker)).toBe(marker);
    expect(packCatalog([{ id: '1' }])).toEqual([{ id: '1' }]);
    expect(readCatalogData(marker)).toBe(marker);
  });
});
