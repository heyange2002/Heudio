import focus from '../assets/images/soundisle_focus_cover_1793256767137.jpg';
import rest from '../assets/images/soundisle_rest_cover_1793256767416.jpg';
import sleep from '../assets/images/soundisle_sleep_cover_1793256767790.jpg';
import workout from '../assets/images/soundisle_rhythm_cover_1793256768456.jpg';

// Vite imports emit real production asset URLs, unlike literal /src/... paths.
export const COVER_IMAGES = { focus, rest, sleep, workout };
export const BUILTIN_COVERS = Object.values(COVER_IMAGES);
const assigned = new Map<string, string>();
export function fallbackCover(trackId: string): string {
  if (!assigned.has(trackId)) assigned.set(trackId, BUILTIN_COVERS[Math.floor(Math.random() * BUILTIN_COVERS.length)]);
  return assigned.get(trackId)!;
}
