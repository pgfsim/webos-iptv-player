import { StorageService } from '../services/storage-service';
import { hasArabicScript } from './arabic-text';

export { hasArabicScript };

// True when the "Hide Arabic titles" setting is on and any name is in Arabic script.
export function hiddenAsArabic(...names: Array<string | undefined>): boolean {
  if (!StorageService.getHideArabic()) return false;
  for (const name of names) if (hasArabicScript(name)) return true;
  return false;
}
