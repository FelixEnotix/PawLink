import type { BlockedServer, EndpointProfile } from '../api/types';

export function isProfileBlocked(profile: EndpointProfile, blocked: BlockedServer[]): boolean {
  const nameKey = profile.name.trim().toLowerCase();
  return blocked.some(
    (entry) =>
      (entry.profile_id && entry.profile_id === profile.id) ||
      (entry.host === profile.host && entry.port === profile.port) ||
      entry.name.trim().toLowerCase() === nameKey,
  );
}
