export const STARLIM_CHALLENGE_SECONDS = 20 * 60;
export const STARLIM_CHALLENGE_MINIMUM = 150_000;
export const STARLIM_CHALLENGE_RADIUS_KM = 18;
export const STARLIM_CHALLENGE_CENTER = { latitude: -31.4201, longitude: -64.1888 } as const;
// Cobertura comercial aproximada acordada: corredor Villa Allende/Saldán,
// Córdoba, Malvinas Argentinas y límite sur en Coronel Olmedo.
export const STARLIM_CHALLENGE_COVERAGE = [
  [-31.270,-64.300],[-31.260,-64.185],[-31.305,-64.105],[-31.385,-64.065],
  [-31.485,-64.105],[-31.535,-64.190],[-31.490,-64.285],[-31.400,-64.330],
] as const;
export const STARLIM_CHALLENGE_STORAGE_KEY = "starlim-challenge-session";

export type StarlimChallengeSession = {
  startedAt: number;
  expiresAt: number;
  latitude: number;
  longitude: number;
  name: string;
  phone: string;
  businessName: string;
  token: string;
};

export function starlimChallengeDistanceKm(latitude: number, longitude: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(latitude - STARLIM_CHALLENGE_CENTER.latitude);
  const dLon = radians(longitude - STARLIM_CHALLENGE_CENTER.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(STARLIM_CHALLENGE_CENTER.latitude)) * Math.cos(radians(latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isStarlimChallengeLocation(latitude:number,longitude:number){
  let inside=false;
  for(let i=0,j=STARLIM_CHALLENGE_COVERAGE.length-1;i<STARLIM_CHALLENGE_COVERAGE.length;j=i++){
    const [yi,xi]=STARLIM_CHALLENGE_COVERAGE[i]; const [yj,xj]=STARLIM_CHALLENGE_COVERAGE[j];
    const intersects=(yi>latitude)!==(yj>latitude) && longitude < (xj-xi)*(latitude-yi)/(yj-yi)+xi;
    if(intersects) inside=!inside;
  }
  return inside;
}

