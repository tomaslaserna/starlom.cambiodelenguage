export const STARLIM_CHALLENGE_SECONDS = 20 * 60;
export const STARLIM_CHALLENGE_MINIMUM = 150_000;
export const STARLIM_CHALLENGE_RADIUS_KM = 18;
export const STARLIM_CHALLENGE_CENTER = { latitude: -31.4201, longitude: -64.1888 } as const;
export const STARLIM_CHALLENGE_STORAGE_KEY = "starlim-challenge-session";

export type StarlimChallengeSession = {
  startedAt: number;
  expiresAt: number;
  latitude: number;
  longitude: number;
  name: string;
  phone: string;
  businessName: string;
};

export function starlimChallengeDistanceKm(latitude: number, longitude: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(latitude - STARLIM_CHALLENGE_CENTER.latitude);
  const dLon = radians(longitude - STARLIM_CHALLENGE_CENTER.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(STARLIM_CHALLENGE_CENTER.latitude)) * Math.cos(radians(latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

