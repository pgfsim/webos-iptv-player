// Arabic, Arabic Supplement, Arabic Extended-A/B, and the presentation forms.
// Kept apart from the setting so the search worker can import it.
const ARABIC = /[؀-ۿݐ-ݿࡰ-࢟ࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function hasArabicScript(text: string | undefined): boolean {
  return !!text && ARABIC.test(text);
}
