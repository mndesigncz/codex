'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { pragueToday, pragueDaySafe } from '@/lib/pragueTime';

export interface ChatUser {
  id: number;
  name: string;
  role?: string;
  avatar?: string;
}

export interface Conversation {
  id: number;
  type: 'team' | 'direct';
  name: string;
  avatar: string | null;
  otherUserId: number | null;
  lastMessage: string | null;
  lastTime: string | null;
  unreadCount: number;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  content: string | null;
  attachmentUrl: string | null;
  attachmentType: 'image' | 'file' | null;
  attachmentName: string | null;
  createdAt: string;
  senderName: string;
  senderAvatar: string;
}

export interface UploadResult {
  url: string;
  type: 'image' | 'file';
  name: string;
}

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch('/api/conversations');
  if (!res.ok) return [];
  const data = await res.json();
  return data.conversations ?? [];
}

export async function fetchMessages(conversationId: number): Promise<ChatMessage[]> {
  const res = await fetch(`/api/conversations/${conversationId}/messages`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages ?? [];
}

export async function sendMessage(
  conversationId: number,
  payload: { content?: string; attachmentUrl?: string; attachmentType?: string; attachmentName?: string },
): Promise<ChatMessage | null> {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.message ?? null;
}

/**
 * Najde nebo založí přímou konverzaci s kolegou.
 *
 * Endpoint tu byl od začátku, ale nic v aplikaci ho nevolalo — chat se tím
 * scvrkl na jediný týmový kanál a „napsat Petrovi" nešlo odnikud. Tohle je
 * ta chybějící polovina.
 */
export async function startDirect(otherUserId: number): Promise<number | null> {
  const res = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otherUserId }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return typeof data?.id === 'number' ? data.id : null;
}

export async function markRead(conversationId: number): Promise<void> {
  try {
    await fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' });
  } catch {
    /* noop */
  }
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function uploadFile(file: File): Promise<UploadResult | null> {
  const { compressImage } = await import('@/lib/clientImage');
  const prepared = await compressImage(file);
  const form = new FormData();
  form.append('file', prepared);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) return null;
  return (await res.json()) as UploadResult;
}

/**
 * Čas u zprávy — vždy podle pražských hodin na zdi.
 *
 * Dřív se den i hodina braly z hodin prohlížeče. U uzávěrky po půlnoci to
 * znamenalo, že zpráva z 23:50 dostala u bubliny „dnešní" hodinu a nad ní
 * oddělovač „Včera" — dvě různé odpovědi na tutéž otázku v jedné obrazovce.
 * Zbytek aplikace kvůli tomu má `lib/pragueTime`; chat na něj byl zapomenutý.
 */
export function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const key = pragueDaySafe(d);
  if (key === pragueToday()) {
    return d.toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' });
  }
  if (key === pragueToday(-1)) return 'Včera';
  return d.toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric' });
}

/** Jen hodina a minuta, pražsky. Ve vlákně s oddělovači dnů den říká čára. */
export function formatClock(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' });
}

/** Den zprávy jako klíč — pro oddělovače ve vlákně. Pražský, jako všude. */
export function dayKey(iso: string): string {
  return pragueDaySafe(iso);
}

/** „Dnes" / „Včera" / „pondělí 14. 4." — hlavička dne ve vlákně. */
export function dayLabel(iso: string): string {
  const key = dayKey(iso);
  if (key === pragueToday()) return 'Dnes';
  if (key === pragueToday(-1)) return 'Včera';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = key.slice(0, 4) === pragueToday().slice(0, 4);
  return d.toLocaleDateString('cs-CZ', {
    timeZone: 'Europe/Prague',
    weekday: 'long', day: 'numeric', month: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

// Hook: load conversation list and poll it.
export function useConversations(pollMs = 8000) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await fetchConversations();
    setConversations(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { conversations, loading, refresh, setConversations };
}

// Hook: load + poll messages for a single open conversation.
export function useThreadMessages(conversationId: number | null, pollMs = 5000) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const idRef = useRef(conversationId);
  idRef.current = conversationId;

  const load = useCallback(async () => {
    if (idRef.current == null) return;
    const msgs = await fetchMessages(idRef.current);
    if (idRef.current === conversationId) {
      setMessages(msgs);
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (conversationId == null) {
      setMessages([]);
      return;
    }
    setLoading(true);
    setMessages([]);
    load();
    markRead(conversationId);
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [conversationId, load, pollMs]);

  return { messages, setMessages, loading, reload: load };
}
