import { HOME_PHOTOS } from '@/lib/home-photos';
import type { Verse } from '@/lib/verses';

export function VerseCard({ verse }: { verse: Verse | null }) {
  return (
    <section className="card verse-card" aria-labelledby="votd-h" aria-busy={verse ? undefined : true}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="vc-bg" alt="" src={HOME_PHOTOS.verse} />
      <h2 id="votd-h" className="vc-label">
        Verse of the Day
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
