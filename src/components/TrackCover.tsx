import { useState } from 'react';
import { fallbackCover } from '../utils/coverFallback';

type Props = { trackId: string; src?: string; alt: string; className?: string };
// key resets the failed-source state when the track or album artwork changes.
export function TrackCover(props: Props) {
  return <CoverImage key={props.trackId + ':' + props.src} {...props} />;
}
function CoverImage({ trackId, src, alt, className }: Props) {
  const [failed, setFailed] = useState(false);
  return <img src={!src?.trim() || failed ? fallbackCover(trackId) : src} alt={alt} className={className}
    referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
