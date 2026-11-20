'use client';

import React from 'react';
import { Icon } from '@/components/ubf';
import type { ChatMessage } from '@/types/database';

export const firstName = (name?: string) => (name || 'Member').split(' ')[0];

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
}

/** One message row in the room's message list. */
export function MessageItem({ mine, pod, type, text, avatar, name, time, status }: MessageItemProps) {
  const special = type === 'icebreaker' || type === 'prayer_request' || type === 'milestone';
  const kind =
    type === 'icebreaker' ? (
      <span className="kind">
        <Icon name="bulb" />
        Conversation Starter
      </span>
    ) : type === 'prayer_request' ? (
      <span className="kind">
        <Icon name="heart" />
        Prayer Request
      </span>
    ) : type === 'milestone' ? (
      <span className="kind">
        <Icon name="target" />
        Personal Goal
      </span>
    ) : null;
  const first = firstName(name);
  const showName = !mine && (pod || special);
  const label = special ? (mine ? 'You' : first) : first;
  const cls = [
    'msg',
    mine ? 'me' : '',
    special ? `special ${type === 'prayer_request' ? 'prayer' : type === 'icebreaker' ? 'starter' : type}` : '',
    status === 'sending' ? 'pending pop' : '',
    status === 'failed' ? 'failed' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li className={cls}>
      {mine ? null : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="avatar" src={avatar} width={32} height={32} alt="" />
      )}
      <div>
        {showName || special ? (
          <p className="who">{label}</p>
        ) : (
          <span className="sr">{mine ? 'You' : first}: </span>
        )}
        <div className="bubble">
          {kind}
          {text}
        </div>
        {time}
      </div>
    </li>
  );
}
