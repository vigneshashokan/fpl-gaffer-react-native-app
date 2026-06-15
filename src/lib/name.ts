// src/lib/name.ts
//
// Display helpers for a user's name. `initialsOf` is shared by the profile
// hero, the brand-header avatar, and the account menu so the avatar glyph
// stays consistent everywhere.

export function initialsOf(firstName?: string, lastName?: string): string {
  const first = firstName?.trim()[0] ?? '';
  const last = lastName?.trim()[0] ?? '';
  return `${first}${last}`.toUpperCase();
}
