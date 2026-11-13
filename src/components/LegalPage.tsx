import Link from 'next/link';
import type { ReactNode } from 'react';
import { Rose } from '@/components/ubf';

/** Plain public page for the Privacy Policy and Terms (no sign-in needed). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="wrap legal">
      <Link href="/auth" className="brand" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <Rose size={28} />
        <b>Unite by Faith</b>
      </Link>
      <article className="card legal-card">
        <h1 className="h1">{title}</h1>
        <p className="sub">Last updated {updated}</p>
        {children}
      </article>
    </main>
  );
}
