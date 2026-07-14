import { randomBytes } from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

// 6-char team join code, e.g. "K7QP2M"
export function generateJoinCode(): string {
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

// URL-safe invitation token
export function generateInviteToken(): string {
  return randomBytes(24).toString('base64url');
}
