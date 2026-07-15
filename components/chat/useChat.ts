'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

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

export async function markRead(conversationId: number): Promise<void> {
  try {
    await fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' });
  } catch {
    /* noop */
  }
}

export async function uploadFile(file: File): Promise<UploadResult | null> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  if (!res.ok) return null;
  return (await res.json()) as UploadResult;
}

export function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Včera';
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
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
