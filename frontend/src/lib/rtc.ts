// Shared WebRTC settings for the senior and the caregiver.
const iceServers: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// TURN relays audio when a direct connection is impossible (different networks, mobile data, strict NAT).
// Set these in .env.local (e.g. free tier from metered.ca or your own coturn):
// NEXT_PUBLIC_TURN_URL=turn:your-turn-host:3478
// NEXT_PUBLIC_TURN_USERNAME=...
// NEXT_PUBLIC_TURN_CREDENTIAL=...
if (process.env.NEXT_PUBLIC_TURN_URL) {
  iceServers.push({
    urls: process.env.NEXT_PUBLIC_TURN_URL.split(","),
    username: process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
  });
}
// 75 -> "01:15", 3725 -> "1:02:05"
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
export const RTC_CONFIG: RTCConfiguration = { iceServers };

export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: false,
};

export const CONNECT_TIMEOUT_MS = 20_000;

export const log = (...args: unknown[]) => console.log("[call]", ...args);