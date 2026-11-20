import { useId } from 'react';
import { HOME_PHOTOS } from '@/lib/home-photos';
import type { Verse } from '@/lib/verses';

/** Today's verse on its photo; `compact` is the smaller card shown while a match search runs. */
export function VerseCard({ verse, compact }: { verse: Verse | null; compact?: boolean }) {
  const compactId = useId();
  const headingId = compact ? compactId : 'votd-h';
  return (
    <section
      className={`card verse-card${compact ? ' vc-compact' : ''}`}
      aria-labelledby={headingId}
      aria-busy={verse ? undefined : true}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="vc-bg" alt="" src={HOME_PHOTOS.verse} />
      <h2 id={headingId} className="vc-label">
        {compact ? 'Today’s verse' : 'Verse of the Day'}
      </h2>
      {verse ? (
        <figure>
          <figcaption className="vc-ref">{verse.ref} BSB</figcaption>
          <blockquote className="vc-text">
            <p>{verse.text}</p>
          </blockquote>
        </figure>
      ) : (
        <div className="vc-skel" aria-hidden="true">
          <span className="skel" style={{ height: 16, width: '40%' }} />
          <span className="skel" style={{ height: 22 }} />
          <span className="skel" style={{ height: 22, width: '80%' }} />
        </div>
      )}
    </section>
  );
}
