'use client';

import React, { useRef, useState } from 'react';
import { Icon } from '@/components/ubf';
import { messageActions, type MenuAction } from '@/lib/chat/view';
import type { ChatMessage, ReactionEmoji, ReplyQuote } from '@/types/database';
import { MessageMenu } from './MessageMenu';

export const firstName = (name?: string) => (name || 'Member').split(' ')[0];

const LONG_PRESS_MS = 450;
const PRESS_SLOP_PX = 10;

export interface MessageHandlers {
  onJump: (messageId: string) => void;
  onReact: (m: ChatMessage, emoji: ReactionEmoji) => void;
  /** trigger: the More Actions button, for returning focus after a dialog. */
  onAction: (m: ChatMessage, action: MenuAction, trigger: HTMLButtonElement | null) => void;
}

export interface MessageItemProps {
  mine: boolean;
  /** Pod rooms name every sender; duo rooms only name special messages. */
  pod: boolean;
  type: ChatMessage['message_type'];
  text: string;
  avatar?: string;
  name?: string;
  time: React.ReactNode;
  status?: 'sending' | 'failed';
  /** The stored message; absent while a message is still sending. */
  message?: ChatMessage;
  meId?: string;
  quote?: ReplyQuote | null;
  /** The quoted message is in the loaded list, so the quote can jump to it. */
  canJump?: boolean;
  tick?: 'sent' | 'seen' | null;
  handlers?: MessageHandlers;
}

/** One message row in the room's message list. */
export function MessageItem({
  mine,
  pod,
  type,
  text,
  avatar,
  name,
  time,
  status,
  message,
  meId,
  quote,
  canJump,
  tick,
  handlers,
}: MessageItemProps) {
  const deleted = Boolean(message?.deleted_at);
  const canMenu = Boolean(message && !deleted && handlers && meId);

  // When the menu opened; also the clock the Edit window is judged by.
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const swallowClick = useRef(false);
  const suppressContextMenu = useRef(false);

  function openMenu() {
    suppressContextMenu.current = true;
    setMenuAt(Date.now());
  }

  function closeMenu(refocus: boolean) {
    suppressContextMenu.current = false;
    setMenuAt(null);
    if (refocus) triggerRef.current?.focus();
  }

  function clearPress() {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }

  const special = !deleted && (type === 'icebreaker' || type === 'prayer_request' || type === 'milestone');
  const kind = !special ? null : type === 'icebreaker' ? (
    <span className="kind">
      <Icon name="bulb" />
      Conversation Starter
    </span>
  ) : type === 'prayer_request' ? (
    <span className="kind">
      <Icon name="heart" />
      Prayer Request
    </span>
  ) : (
    <span className="kind">
      <Icon name="target" />
      Personal Goal
    </span>
  );
  const first = firstName(name);
  const showName = !mine && (pod || special);
  const label = special ? (mine ? 'You' : first) : first;
  const cls = [
    'msg',
    mine ? 'me' : '',
    special ? `special ${type === 'prayer_request' ? 'prayer' : type === 'icebreaker' ? 'starter' : type}` : '',
    deleted ? 'deleted' : '',
    status === 'sending' ? 'pending pop' : '',
    status === 'failed' ? 'failed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  let quoteEl: React.ReactNode = null;
  if (quote && !deleted) {
    if (quote.deleted) {
      quoteEl = <p className="quote gone">Deleted message</p>;
    } else {
      const body = (
        <>
          <span className="sr">In reply to </span>
          <b>{quote.sender_name}</b>
          <span className="sr">: </span>
          <span className="q-text">{quote.snippet}</span>
        </>
      );
      quoteEl =
        canJump && handlers ? (
          <button type="button" className="quote" onClick={() => handlers.onJump(quote.id)}>
            {body}
            <span className="sr">. Show original message</span>
          </button>
        ) : (
          <p className="quote">{body}</p>
        );
    }
  }

  const reactions = !deleted && message?.reactions ? message.reactions : [];
  // Lets the More Actions button say whose message it acts on.
  const descId = canMenu && message ? `msg-${message.id}` : undefined;

  return (
    <li
      id={message ? `msg-${message.id}` : undefined}
      tabIndex={message ? -1 : undefined}
      className={cls}
      onKeyDown={(e) => {
        // The keyboard's context-menu key (or Shift+F10) opens this message's menu.
        if (!canMenu || menuAt !== null) return;
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          openMenu();
        }
      }}
      onContextMenu={(e) => {
        // Only stops the browser menu that follows a long-press or the context-menu key.
        if (suppressContextMenu.current) e.preventDefault();
      }}
    >
      {mine ? null : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="avatar" src={avatar} width={32} height={32} alt="" />
      )}
      <div>
        {showName || special ? (
          <p className="who" id={descId && `${descId}-who`}>
            {label}
          </p>
        ) : (
          <span className="sr" id={descId && `${descId}-who`}>
            {mine ? 'You' : first}:{' '}
          </span>
        )}
        <div
          className="bubble"
          ref={bubbleRef}
          onPointerDown={(e) => {
            swallowClick.current = false;
            if (!canMenu || e.pointerType === 'mouse') return;
            clearPress();
            press.current = {
              x: e.clientX,
              y: e.clientY,
              timer: setTimeout(() => {
                press.current = null;
                swallowClick.current = true;
                openMenu();
              }, LONG_PRESS_MS),
            };
          }}
          onPointerMove={(e) => {
            const p = press.current;
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > PRESS_SLOP_PX) clearPress();
          }}
          onPointerUp={clearPress}
          onPointerCancel={clearPress}
          onPointerLeave={clearPress}
          onClickCapture={(e) => {
            // The tap that ends a long-press must not also follow a quote.
            if (swallowClick.current) {
              swallowClick.current = false;
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          {quoteEl}
          {kind}
          {deleted ? (
            <span className="del-text">This message was deleted</span>
          ) : descId ? (
            <span id={`${descId}-text`}>{text}</span>
          ) : (
            text
          )}
        </div>
        {reactions.length > 0 && message && handlers && (
          <div className="reacts">
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                className="react"
                aria-pressed={r.mine}
                aria-label={`React ${r.emoji}, ${r.count}`}
                onClick={() => handlers.onReact(message, r.emoji)}
              >
                <span aria-hidden="true">{r.emoji}</span>
                <span aria-hidden="true">{r.count}</span>
              </button>
            ))}
          </div>
        )}
        {message ? (
          <p className="msg-meta">
            {time}
            {message.edited_at && !deleted && <span className="edited">edited</span>}
            {tick && !deleted && (
              <span className={`tick ${tick}`}>
                <span aria-hidden="true">{tick === 'seen' ? '✓✓' : '✓'}</span>
                <span className="sr">{tick === 'seen' ? 'Seen' : 'Sent'}</span>
              </span>
            )}
          </p>
        ) : (
          time
        )}
      </div>
      {canMenu && message && handlers && meId && (
        <>
          <button
            ref={triggerRef}
            type="button"
            className="more"
            aria-haspopup="menu"
            aria-expanded={menuAt !== null}
            aria-describedby={`${descId}-who ${descId}-text`}
            onClick={() => (menuAt === null ? openMenu() : closeMenu(false))}
          >
            <Icon name="more" />
            <span className="sr">More actions</span>
          </button>
          {menuAt !== null && (
            <MessageMenu
              anchor={bubbleRef}
              trigger={triggerRef}
              alignEnd={mine}
              actions={messageActions(message, meId, menuAt)}
              reactions={reactions}
              onReact={(emoji) => {
                closeMenu(true);
                handlers.onReact(message, emoji);
              }}
              onAction={(action) => {
                // Copy keeps focus here; Reply and Edit move it to the composer; Delete opens a dialog.
                closeMenu(action === 'copy');
                handlers.onAction(message, action, triggerRef.current);
              }}
              onClose={closeMenu}
            />
          )}
        </>
      )}
    </li>
  );
}
