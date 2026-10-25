
"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const SERVER_URL = "http://localhost:5000";

const DEFAULT_SENIOR_ID = "6ad512cd3b9ef00f0ada1c19";
const DEFAULT_CAREGIVER_ID = "6ad511ecef8a94c2f2c5a969";

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

type Role = "senior" | "caregiver";

export default function WebRTCTestPage() {
  const [role, setRole] = useState<Role>("senior");
  const [seniorId, setSeniorId] = useState(DEFAULT_SENIOR_ID);
  const [caregiverId, setCaregiverId] = useState(DEFAULT_CAREGIVER_ID);
  const [status, setStatus] = useState("Not connected");
  const [connected, setConnected] = useState(false);
  const [incoming, setIncoming] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [logs, setLogs] = useState<string[]>(["Ready to test WebRTC."]);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callIdRef = useRef<string | null>(null);
  const remoteUserIdRef = useRef<string | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const makingCallRef = useRef(false);

  function log(message: string) {
    const line = `${new Date().toLocaleTimeString()} — ${message}`;
    console.log(line);
    setLogs((previous) => [...previous.slice(-99), line]);
  }

  function validId(id: string) {
    return /^[a-f\d]{24}$/i.test(id);
  }

  async function getMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone access is unavailable. Use localhost or HTTPS.");
    }

    if (!localStreamRef.current) {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      log("Microphone permission granted.");
    }

    return localStreamRef.current;
  }

  async function createPeerConnection() {
    pcRef.current?.close();

    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;
    pendingCandidatesRef.current = [];

    pc.onicecandidate = (event) => {
      const socket = socketRef.current;
      const targetUserId = remoteUserIdRef.current;
      const callId = callIdRef.current;

      if (event.candidate && socket && targetUserId && callId) {
        socket.emit("call:ice-candidate", {
          targetUserId,
          callId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = async (event) => {
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];

        try {
          await remoteAudioRef.current.play();
          log("Remote audio received. You can speak now.");
        } catch {
          log("Remote audio ready. Press Play on the audio player.");
        }
      }
    };

    pc.onconnectionstatechange = () => {
      log(`WebRTC connection: ${pc.connectionState}`);
      if (pc.connectionState === "failed") {
        log("Connection failed. Network restrictions may require a TURN server.");
      }
    };

    const stream = await getMicrophone();
    stream.getAudioTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });
  }

  async function addPendingCandidates() {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;

    for (const candidate of pendingCandidatesRef.current) {
      await pc.addIceCandidate(candidate);
    }

    pendingCandidatesRef.current = [];
  }

  function cleanupCall() {
    pcRef.current?.close();
    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    callIdRef.current = null;
    remoteUserIdRef.current = null;
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    makingCallRef.current = false;

    setIncoming(false);
    setCallActive(false);
    log("Call cleaned up.");
  }

  function disconnect() {
    cleanupCall();
    socketRef.current?.disconnect();
    socketRef.current = null;
    setConnected(false);
    setStatus("Disconnected");
    log("Socket disconnected.");
  }

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function connect() {
    if (!validId(seniorId) || !validId(caregiverId)) {
      log("Enter valid 24-character MongoDB IDs for both users.");
      return;
    }

    disconnect();

    const myId = role === "senior" ? seniorId.trim() : caregiverId.trim();
    remoteUserIdRef.current =
      role === "senior" ? caregiverId.trim() : seniorId.trim();

    const socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;
    setStatus("Connecting...");

    socket.on("connect", () => {
      socket.emit("test:join-user", myId);
      setStatus(`Connected: ${socket.id}`);
      log(`Socket connected as ${role}. Joining room...`);
    });

    socket.on("test:user-joined", (data: { userId: string }) => {
      setConnected(true);
      setStatus(`Connected as ${role}`);
      log(`Joined room for user ${data.userId}.`);
    });

    socket.on("connect_error", (error) => {
      setStatus("Connection failed");
      log(`Socket error: ${error.message}`);
    });

    socket.on("call:incoming", (data: { callId: string; seniorId: string }) => {
      callIdRef.current = data.callId;
      remoteUserIdRef.current = data.seniorId;
      setIncoming(true);
      log(`Incoming call from senior ${data.seniorId}.`);
    });

    socket.on(
      "call:offer",
      (data: { callId: string; offer: RTCSessionDescriptionInit }) => {
        callIdRef.current = data.callId;
        pendingOfferRef.current = data.offer;
        log("WebRTC offer received. Accept the call.");
      }
    );

    socket.on(
      "call:answer",
      async (data: { callId: string; answer: RTCSessionDescriptionInit }) => {
        try {
          if (
            !pcRef.current ||
            data.callId !== callIdRef.current ||
            !makingCallRef.current
          ) return;

          await pcRef.current.setRemoteDescription(data.answer);
          await addPendingCandidates();
          setCallActive(true);
          log("Call answered. Connecting audio...");
        } catch (error) {
          log(`Answer error: ${String(error)}`);
        }
      }
    );

    socket.on(
      "call:ice-candidate",
      async (data: { callId: string; candidate: RTCIceCandidateInit }) => {
        try {
          if (data.callId !== callIdRef.current || !pcRef.current) return;

          if (pcRef.current.remoteDescription) {
            await pcRef.current.addIceCandidate(data.candidate);
          } else {
            pendingCandidatesRef.current.push(data.candidate);
          }
        } catch (error) {
          log(`ICE candidate error: ${String(error)}`);
        }
      }
    );

    socket.on("call:rejected", () => {
      log("The other participant rejected the call.");
      cleanupCall();
    });

    socket.on("call:ended", () => {
      log("The other participant ended the call.");
      cleanupCall();
    });

    socket.on("call:error", (data: { message: string }) => {
      log(`Call error: ${data.message}`);
    });
  }

  async function callCaregiver() {
    try {
      const socket = socketRef.current;
      if (!socket?.connected) throw new Error("Connect to the backend first.");

      makingCallRef.current = true;
      remoteUserIdRef.current = caregiverId.trim();
      callIdRef.current = crypto.randomUUID();

      socket.emit("call:initiate", {
        callId: callIdRef.current,
        caregiverId: caregiverId.trim(),
        seniorId: seniorId.trim(),
      });

      await createPeerConnection();

      const pc = pcRef.current!;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("call:offer", {
        targetUserId: caregiverId.trim(),
        callId: callIdRef.current,
        offer: pc.localDescription,
      });

      setCallActive(true);
      log(`Calling caregiver. Call ID: ${callIdRef.current}`);
    } catch (error) {
      makingCallRef.current = false;
      log(`Cannot start call: ${String(error)}`);
    }
  }

  async function acceptCall() {
    try {
      const socket = socketRef.current;
      const offer = pendingOfferRef.current;
      const callId = callIdRef.current;

      if (!socket?.connected) throw new Error("Connect to the backend first.");
      if (!offer || !callId) throw new Error("No offer yet. Wait for the caller.");

      await createPeerConnection();

      const pc = pcRef.current!;
      await pc.setRemoteDescription(offer);
      await addPendingCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("call:answer", {
        targetUserId: remoteUserIdRef.current,
        callId,
        answer: pc.localDescription,
      });

      setIncoming(false);
      setCallActive(true);
      log("Call accepted. Waiting for audio connection...");
    } catch (error) {
      log(`Cannot accept call: ${String(error)}`);
    }
  }

  function rejectCall() {
    if (callIdRef.current && remoteUserIdRef.current) {
      socketRef.current?.emit("call:reject", {
        targetUserId: remoteUserIdRef.current,
        callId: callIdRef.current,
      });
    }

    cleanupCall();
    log("Call rejected.");
  }

  function endCall() {
    if (callIdRef.current && remoteUserIdRef.current) {
      socketRef.current?.emit("call:end", {
        targetUserId: remoteUserIdRef.current,
        callId: callIdRef.current,
      });
    }

    cleanupCall();
    log("Call ended.");
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <h1 className="text-3xl font-bold">SOS WebRTC Test</h1>
          <p className="mt-2 text-slate-600">
            Test a browser-to-browser voice call through your Socket.IO backend.
          </p>
        </header>

        <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">1. Test identities</h2>

          <label className="block text-sm font-medium">
            Role
            <select
              className="mt-1 w-full rounded-lg border p-3"
              value={role}
              disabled={connected || callActive || incoming}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              <option value="senior">Senior — caller</option>
              <option value="caregiver">Caregiver — receiver</option>
            </select>
          </label>

          <label className="block text-sm font-medium">
            Senior MongoDB ID
            <input
              className="mt-1 w-full rounded-lg border p-3"
              value={seniorId}
              onChange={(event) => setSeniorId(event.target.value)}
              disabled={connected}
            />
          </label>

          <label className="block text-sm font-medium">
            Caregiver MongoDB ID
            <input
              className="mt-1 w-full rounded-lg border p-3"
              value={caregiverId}
              onChange={(event) => setCaregiverId(event.target.value)}
              disabled={connected}
            />
          </label>

          <p className="text-sm text-slate-600">{status}</p>

          {!connected ? (
            <button
              className="w-full rounded-lg bg-blue-700 p-3 font-semibold text-white"
              onClick={connect}
            >
              Connect to backend
            </button>
          ) : (
            <button
              className="w-full rounded-lg bg-slate-700 p-3 font-semibold text-white"
              onClick={disconnect}
            >
              Disconnect
            </button>
          )}
        </section>

        <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">2. Voice call</h2>

          {role === "senior" && (
            <button
              className="w-full rounded-lg bg-red-600 p-3 font-semibold text-white disabled:opacity-40"
              onClick={callCaregiver}
              disabled={!connected || callActive}
            >
              Call caregiver
            </button>
          )}

          {role === "caregiver" && (
            <div className="space-y-3">
              <p>{incoming ? "Incoming call — accept or reject." : "Waiting for a call..."}</p>
              <button
                className="w-full rounded-lg bg-green-700 p-3 font-semibold text-white disabled:opacity-40"
                onClick={acceptCall}
                disabled={!connected || !incoming || !pendingOfferRef.current}
              >
                Accept call
              </button>
              <button
                className="w-full rounded-lg bg-amber-600 p-3 font-semibold text-white disabled:opacity-40"
                onClick={rejectCall}
                disabled={!incoming}
              >
                Reject call
              </button>
            </div>
          )}

          <button
            className="w-full rounded-lg bg-slate-800 p-3 font-semibold text-white disabled:opacity-40"
            onClick={endCall}
            disabled={!callActive && !incoming}
          >
            End call
          </button>

          <audio ref={remoteAudioRef} autoPlay controls className="w-full" />
          <p className="text-sm text-slate-500">
            Allow microphone access when your browser asks. Use headphones to avoid audio feedback.
          </p>
        </section>

        <section className="rounded-2xl bg-slate-950 p-5 text-green-300 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Activity log</h2>
            <button
              className="rounded border border-slate-600 px-3 py-1 text-sm"
              onClick={() => setLogs([])}
            >
              Clear
            </button>
          </div>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">
            {logs.join("\n")}
          </pre>
        </section>
      </div>
    </main>
  );
}
