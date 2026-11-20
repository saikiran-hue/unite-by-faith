'use client';

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Btn, Icon, AlertBox, type IconName } from '@/components/ubf';
import { REACTIONS } from '@/lib/chat/rules';
import type { MenuAction } from '@/lib/chat/view';
import type { ReactionCount, ReactionEmoji } from '@/types/database';

const ACTION_ITEMS: Record<MenuAction, { label: string; icon: IconName }> = {
  reply: { label: 'Reply', icon: 'reply' },
  copy: { label: 'Copy', icon: 'copy' },
  edit: { label: 'Edit', icon: 'pencil' },
  delete: { label: 'Delete', icon: 'trash' },
};

const EDGE = 8;
const GAP = 6;

interface MessageMenuProps {
  /** The bubble the menu sits under (or over, when there is no room below). */
  anchor: React.RefObject<HTMLElement | null>;
  /** The More Actions button; clicks on it toggle the menu instead of closing it from outside. */
  trigger: React.RefObject<HTMLElement | null>;
  /** Own messages sit on the right, so their menu lines up with the bubble's right edge. */
  alignEnd: boolean;
  actions: MenuAction[];
  reactions: ReactionCount[];
  onReact: (emoji: ReactionEmoji) => void;
  onAction: (action: MenuAction) => void;
  /** refocus: return focus to the More Actions button (Escape, Tab). */
  onClose: (refocus: boolean) => void;
}

/**
 * Actions for one message. Shown as a manual popover so it renders in the top layer: the message
 * list and the chat card clip overflow, and the app frame is a size container, which would also
 * capture position: fixed.
 */
export function MessageMenu({ anchor, trigger, alignEnd, actions, reactions, onReact, onAction, onClose }: MessageMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mine = new Set(reactions.filter((r) => r.mine).map((r) => r.emoji));

  const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof el.showPopover === 'function' && !el.matches(':popover-open')) el.showPopover();

    let frame = 0;
    const place = (initial: boolean) => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // The message was scrolled away after opening: nothing left to point at.
      if (!initial && (a.bottom < 0 || a.top > vh)) {
        const hadFocus = el.contains(document.activeElement);
        onClose(false);
        if (hadFocus) trigger.current?.focus({ preventScroll: true });
        return;
      }
      // Layout size, not getBoundingClientRect: the opening animation scales the menu.
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      let top = a.bottom + GAP;
      if (top + h > vh - EDGE && a.top - GAP - h >= EDGE) top = a.top - GAP - h;
      top = Math.max(EDGE, Math.min(top, vh - h - EDGE));
      let left = alignEnd ? a.right - w : a.left;
      left = Math.max(EDGE, Math.min(left, vw - w - EDGE));
      el.style.top = `${Math.round(top)}px`;
      el.style.left = `${Math.round(left)}px`;
    };
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => place(false));
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (el.contains(t) || trigger.current?.contains(t)) return;
      onClose(false);
    };

    // Usually a no-op (the bubble was just tapped or holds focus); otherwise bring it into view first.
    anchor.current?.scrollIntoView({ block: 'nearest' });
    place(true);
    items()[0]?.focus({ preventScroll: true });
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('pointerdown', onDown, true);
    };
    // Placed once per opening; the latest onClose is read through the closure it was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      list[(i + list.length) % list.length]?.focus();
    };
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        return go(at + 1);
      case 'ArrowUp':
      case 'ArrowLeft':
        return go(at - 1);
      case 'Home':
        return go(0);
      case 'End':
        return go(list.length - 1);
      case 'Escape':
      case 'Tab':
        e.preventDefault();
        e.stopPropagation();
        onClose(true);
    }
  }

  return (
    <div
      ref={ref}
      popover="manual"
      className="menu msg-menu"
      role="menu"
      aria-label="Message actions"
      // The menu lives inside the message log; keep it out of the log's announcements.
      aria-live="off"
      onKeyDown={onKeyDown}
    >
      <div className="rx-bar" role="group" aria-label="Reactions">
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            role="menuitemradio"
            aria-checked={mine.has(emoji)}
            aria-label={`React ${emoji}`}
            tabIndex={-1}
            onClick={() => onReact(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <hr />
      {actions.map((a) => (
        <button
          key={a}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={a === 'delete' ? 'danger' : undefined}
          onClick={() => onAction(a)}
        >
          <Icon name={ACTION_ITEMS[a].icon} />
          {ACTION_ITEMS[a].label}
        </button>
      ))}
    </div>
  );
}

interface DeleteConfirmProps {
  open: boolean;
  busy: boolean;
  /** Why the last try failed, shown under the title; null when it has not failed. */
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  /** Runs after the dialog has closed, however it closed, so focus can land outside it. */
  onClosed: () => void;
}

/** "Delete for everyone" confirmation, as a native modal dialog (focus trap, Escape). */
export function DeleteConfirm({ open, busy, error, onCancel, onConfirm, onClosed }: DeleteConfirmProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // The safe choice has focus first.
      cancelRef.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="scrim confirm-scrim"
      aria-labelledby="del-h"
      onClose={onClosed}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal confirm">
        <h2 className="h2" id="del-h">
          Delete this message for everyone?
        </h2>
        {error && <AlertBox title="We couldn’t delete that message." text={error} />}
        <div className="foot-btns">
          <Btn variant="btn-quiet" ref={cancelRef} onClick={onCancel} disabled={busy}>
            Cancel
          </Btn>
          <Btn variant="btn-danger" icon="trash" busy={busy} busyLabel="Deleting…" onClick={onConfirm}>
            Delete
          </Btn>
        </div>
      </div>
    </dialog>
  );
}
