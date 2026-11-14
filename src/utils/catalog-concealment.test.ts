import { describe, expect, it } from 'vitest';
import { catalogConcealmentTest, sameCatalogConcealment, type CatalogConcealment } from './catalog-concealment';

const open: CatalogConcealment = {
  sourceApproved: true,
  lockedCategories: [],
  allowedItems: [],
  protectedItems: [],
  uncategorizedLocked: false,
};

describe('catalogConcealmentTest with Hide Arabic titles', () => {
  it('hides titles named or filed in Arabic script', () => {
    const concealed = catalogConcealmentTest({ ...open, hideArabicNames: true, arabicCategories: ['2'] });
    expect(concealed('1', '1', 'Alpha')).toBe(false);
    expect(concealed('2', '1', 'فيلم')).toBe(true);
    expect(concealed('3', '2', 'Bravo')).toBe(true);
  });

  it('hides an Arabic title even when a parental rule allows it', () => {
    const concealed = catalogConcealmentTest({ ...open, allowedItems: ['2'], hideArabicNames: true });
    expect(concealed('2', '1', 'فيلم')).toBe(true);
  });

  it('leaves Arabic titles alone while the setting is off', () => {
    expect(catalogConcealmentTest(open)('2', '1', 'فيلم')).toBe(false);
  });

  it('tells the setting apart when comparing rules', () => {
    expect(sameCatalogConcealment(open, { ...open, hideArabicNames: true })).toBe(false);
    expect(sameCatalogConcealment(
      { ...open, hideArabicNames: true, arabicCategories: ['2'] },
      { ...open, hideArabicNames: true, arabicCategories: ['3'] },
    )).toBe(false);
    expect(sameCatalogConcealment({ ...open }, { ...open })).toBe(true);
  });
});
