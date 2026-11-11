'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserProfile } from '@/types/database';
import { Icon, Rose, ThemeButton } from '@/components/ubf';

interface AppShellProps {
  currentUser: UserProfile | null;
  allProfiles?: UserProfile[];
  onSwitchedUser?: () => void;
  children: React.ReactNode;
}

/** Top bar from the design (brand, theme toggle, profile menu) followed by the page. */
export function AppShell({ currentUser, allProfiles = [], onSwitchedUser, children }: AppShellProps) {
  return (
    <>
      <Topbar currentUser={currentUser} allProfiles={allProfiles} onSwitchedUser={onSwitchedUser} />
      {children}
    </>
  );
}

function Topbar({
  currentUser,
  allProfiles,
  onSwitchedUser,
}: {
  currentUser: UserProfile | null;
  allProfiles: UserProfile[];
  onSwitchedUser?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  async function switchTo(userId: string) {
    if (userId === currentUser?.id) {
      setOpen(false);
      return;
    }
    setSwitchingId(userId);
    setSwitchError(null);
    try {
      const res = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        setSwitchError("We couldn't switch profiles. Tap the name again.");
        return;
      }
      setOpen(false);
      if (onSwitchedUser) onSwitchedUser();
      else router.refresh();
    } catch {
      setSwitchError("We couldn't switch profiles. Check your connection and tap the name again.");
    } finally {
      setSwitchingId(null);
    }
  }

  const first = currentUser?.full_name.split(' ')[0];

  return (
    <header className="topbar">
      <div className="wrap topbar-in">
        <Link href="/" className="brand" aria-label="Unite by Faith, Home">
          <Rose size={30} />
          <span>Unite by Faith</span>
        </Link>
        <div className="bar-end">
          <ThemeButton />
          {currentUser && (
            <div
              className="menu-wrap"
              ref={wrapRef}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && open) {
                  setOpen(false);
                  triggerRef.current?.focus();
                }
              }}
            >
              <button
                ref={triggerRef}
                type="button"
                className="profile-btn"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="avatar" src={currentUser.avatar_url} width={36} height={36} alt="" />
                <span className="pname">{first}</span>
                <span className="sr">Open profile menu</span>
                <Icon name="down" />
              </button>
              {open && (
                <div className="menu" role="menu" aria-label="Profile">
                  <div className="menu-label">Switch Profile</div>
                  {switchError && (
                    <p role="alert" className="small" style={{ padding: '4px 10px', color: 'var(--u-danger)' }}>
                      {switchError}
                    </p>
                  )}
                  <div style={{ maxHeight: 264, overflowY: 'auto' }}>
                    {allProfiles.map((p) => {
                      const isMe = p.id === currentUser.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isMe}
                          disabled={switchingId !== null}
                          onClick={() => switchTo(p.id)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img className="avatar" src={p.avatar_url} width={32} height={32} alt="" />
                          <span className="grow trunc">{p.full_name}</span>
                          {switchingId === p.id ? (
                            <span className="spin" aria-hidden="true" />
                          ) : isMe ? (
                            <span className="end">
                              <Icon name="check" />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <hr />
                  <button type="button" role="menuitem" onClick={() => router.push('/onboarding')}>
                    <Icon name="user" />
                    Profile Details
                  </button>
                  <button type="button" role="menuitem" onClick={() => router.push('/auth')}>
                    <Icon name="userplus" />
                    New Account
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
