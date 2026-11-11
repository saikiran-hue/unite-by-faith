'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Users,
  SlidersHorizontal,
  UserPlus,
  ChevronDown,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { UserProfile } from '@/types/database';
import { RoseWindow } from '@/components/RoseWindow';

interface NavbarProps {
  currentUser: UserProfile | null;
  allProfiles?: UserProfile[];
  onSwitchedUser?: () => void;
}

export function Navbar({
  currentUser,
  allProfiles = [],
  onSwitchedUser,
}: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  async function handleSwitchUser(userId: string) {
    setSwitchingId(userId);
    try {
      const res = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setDropdownOpen(false);
        if (onSwitchedUser) {
          onSwitchedUser();
        } else {
          router.refresh();
        }
      }
    } finally {
      setSwitchingId(null);
    }
  }

  const navLinks = [
    { href: '/', label: 'Matches', icon: Users, active: pathname === '/' },
    {
      href: '/onboarding',
      label: 'My profile',
      icon: SlidersHorizontal,
      active: !!pathname?.startsWith('/onboarding'),
    },
    {
      href: '/auth',
      label: 'New account',
      icon: UserPlus,
      active: !!pathname?.startsWith('/auth'),
    },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5">
          <span aria-hidden="true">
            <RoseWindow
              scores={{ faith: 100, skills: 100, hobbies: 100, tastes: 100 }}
              size={34}
            />
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-ink-900">
            Unite by Faith
          </span>
        </Link>

        {/* Primary nav (desktop) */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {navLinks.map(({ href, label, icon: Icon, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
                active
                  ? 'bg-ink-100 text-ink-900'
                  : 'text-ink-500 hover:bg-ink-50 hover:text-ink-900'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        {/* Profile switcher */}
        <div
          className="relative flex items-center gap-2"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && dropdownOpen) setDropdownOpen(false);
          }}
        >
          {currentUser && (
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-ink-200 bg-white py-1 pl-1 pr-2.5 text-left transition-colors hover:bg-ink-50"
              aria-expanded={dropdownOpen}
              aria-label={`${currentUser.full_name}, switch profile`}
            >
              <img
                src={
                  currentUser.avatar_url ||
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
                }
                alt=""
                className="block h-8 w-8 rounded-full object-cover"
              />
              <span className="hidden max-w-[140px] truncate text-sm font-medium text-ink-800 sm:block">
                {currentUser.full_name}
              </span>
              <ChevronDown className="h-4 w-4 text-ink-400" aria-hidden="true" />
            </button>
          )}

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-ink-200 bg-white p-1.5 shadow-lg shadow-ink-900/5">
              <div className="px-3 pb-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">Switch profile</span>
                  <span className="inline-flex items-center gap-1 text-xs text-ink-600">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Live
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  View matches from another member&apos;s perspective.
                </p>
              </div>

              <div className="max-h-64 space-y-0.5 overflow-y-auto border-t border-ink-100 py-1.5">
                {allProfiles.map((prof) => {
                  const isCurrent = prof.id === currentUser?.id;
                  return (
                    <button
                      key={prof.id}
                      type="button"
                      disabled={switchingId === prof.id}
                      aria-current={isCurrent ? 'true' : undefined}
                      onClick={() => handleSwitchUser(prof.id)}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors disabled:opacity-60 ${
                        isCurrent ? 'bg-primary-50' : 'hover:bg-ink-50'
                      }`}
                    >
                      <img
                        src={prof.avatar_url}
                        alt=""
                        className="block h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium text-ink-900">
                          {prof.full_name}
                        </p>
                        <p className="break-words text-xs text-ink-500">
                          {prof.headline}
                        </p>
                      </div>
                      {isCurrent && (
                        <Check className="h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-1.5 border-t border-ink-100 pt-1.5">
                <Link
                  href="/onboarding"
                  onClick={() => setDropdownOpen(false)}
                  className="btn-ghost flex-1"
                >
                  Edit profile
                </Link>
                <Link
                  href="/auth"
                  onClick={() => setDropdownOpen(false)}
                  className="btn-ghost flex-1"
                >
                  New profile
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Primary nav (mobile) */}
      <nav
        className="flex gap-1 overflow-x-auto border-t border-ink-100 px-4 py-2 [scrollbar-width:none] md:hidden"
        aria-label="Main"
      >
        {navLinks.map(({ href, label, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${
              active ? 'bg-ink-100 text-ink-900' : 'text-ink-500'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </header>
  );
}
