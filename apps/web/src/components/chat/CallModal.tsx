'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};

export type CallState = 'idle' | 'calling' | 'incoming' | 'active' | 'ended';

export interface IncomingCallPayload {
  callerId: string;
  callerName: string;
  roomId: string;
  callType: 'dm' | 'channel';
  sdp: RTCSessionDescriptionInit;
}

interface CallModalProps {
  /** The socket shared with the parent (dashboard-level socket). */
  socket: Socket | null;
  /** Current user info. */
  userId: string;
  username: string;
  token: string;
  /** Populated when there is an incoming call to show. */
  incomingCall?: IncomingCallPayload | null;
  onIncomingCallHandled: () => void;
  /** Populated when the user initiates an outgoing call. */
  outgoingCall?: { targetUserId: string; targetName: string; roomId: string } | null;
  onOutgoingCallHandled?: () => void;
  /** Called by the modal when the ringing phase ends (call accepted, answered, declined, or ended). */
  onStopRingtone?: () => void;
}

export default function CallModal({
  socket,
  userId,
  username,
  token,
  incomingCall,
  onIncomingCallHandled,
  outgoingCall,
  onOutgoingCallHandled,
  onStopRingtone,
}: CallModalProps) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [remoteName, setRemoteName] = useState('');
  const [callDuration, setCallDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteUserIdRef = useRef<string>('');
  const roomIdRef = useRef<string>('');
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    durationTimerRef.current = null;
    setCallDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);
    pendingIceCandidatesRef.current = [];
  }, []);

  // ── Get user media ─────────────────────────────────────────────────────────

  const getMedia = useCallback(async (): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  }, []);

  // ── Create RTCPeerConnection ───────────────────────────────────────────────

  const createPeer = useCallback(
    (stream: MediaStream): RTCPeerConnection => {
      const peer = new RTCPeerConnection(ICE_SERVERS);
      peerRef.current = peer;

      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      peer.onicecandidate = (e) => {
        if (e.candidate && socket && remoteUserIdRef.current) {
          socket.emit('ice_candidate', {
            targetUserId: remoteUserIdRef.current,
            candidate: e.candidate.toJSON(),
          });
        }
      };

      peer.ontrack = (e) => {
        if (remoteVideoRef.current && e.streams[0]) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') {
          setCallState('active');
          onStopRingtone?.(); // stop outgoing ringtone — call is now live
          durationTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
        }
        if (['disconnected', 'failed', 'closed'].includes(peer.connectionState)) {
          endCall(false);
        }
      };

      return peer;
    },
    [socket]
  );

  // ── Initiate an outgoing call ──────────────────────────────────────────────

  const startCall = useCallback(
    async (targetUserId: string, targetName: string, roomId: string) => {
      if (!socket) return;
      remoteUserIdRef.current = targetUserId;
      roomIdRef.current = roomId;
      setRemoteName(targetName);
      setCallState('calling');

      try {
        const stream = await getMedia();
        const peer = createPeer(stream);
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        socket.emit('call_offer', {
          targetUserId,
          sdp: offer,
          callType: 'dm',
          roomId,
          callerId: userId,
          callerName: username,
        });
      } catch (err) {
        console.error('[Call] Failed to start call:', err);
        cleanup();
        setCallState('idle');
      }
    },
    [socket, userId, username, getMedia, createPeer, cleanup]
  );

  // ── Accept an incoming call ────────────────────────────────────────────────

  const acceptCall = useCallback(async () => {
    if (!incomingCall || !socket) return;
    remoteUserIdRef.current = incomingCall.callerId;
    roomIdRef.current = incomingCall.roomId;
    setRemoteName(incomingCall.callerName);
    setCallState('active');
    onStopRingtone?.(); // stop incoming ringtone
    onIncomingCallHandled();

    try {
      const stream = await getMedia();
      const peer = createPeer(stream);

      await peer.setRemoteDescription(new RTCSessionDescription(incomingCall.sdp));

      // Flush any ICE candidates that arrived before remote description was set
      for (const c of pendingIceCandidatesRef.current) {
        await peer.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingIceCandidatesRef.current = [];

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit('call_answer', {
        targetUserId: incomingCall.callerId,
        sdp: answer,
      });

      durationTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } catch (err) {
      console.error('[Call] Failed to accept call:', err);
      cleanup();
      setCallState('idle');
    }
  }, [incomingCall, socket, getMedia, createPeer, cleanup, onIncomingCallHandled]);

  // ── End / reject a call ────────────────────────────────────────────────────

  const endCall = useCallback(
    (notify = true) => {
      if (notify && socket && remoteUserIdRef.current) {
        socket.emit('call_end', {
          targetUserId: remoteUserIdRef.current,
          roomId: roomIdRef.current,
        });
      }
      cleanup();
      onStopRingtone?.(); // always stop ringtone on any call end/decline
      setCallState('idle');
      onIncomingCallHandled();
    },
    [socket, cleanup, onIncomingCallHandled, onStopRingtone]
  );

  // ── Handle incoming socket events ─────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const onAnswer = async (payload: { sdp: RTCSessionDescriptionInit; fromUserId: string }) => {
      if (!peerRef.current) return;
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      for (const c of pendingIceCandidatesRef.current) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingIceCandidatesRef.current = [];
    };

    const onIceCandidate = async (payload: { candidate: RTCIceCandidateInit }) => {
      if (peerRef.current?.remoteDescription) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } else {
        pendingIceCandidatesRef.current.push(payload.candidate);
      }
    };

    const onCallEnd = () => endCall(false);

    socket.on('call_answer', onAnswer);
    socket.on('ice_candidate', onIceCandidate);
    socket.on('call_end', onCallEnd);

    return () => {
      socket.off('call_answer', onAnswer);
      socket.off('ice_candidate', onIceCandidate);
      socket.off('call_end', onCallEnd);
    };
  }, [socket, endCall]);

  // ── React to incomingCall prop (shows the "incoming" ring UI) ─────────────

  useEffect(() => {
    if (incomingCall && callState === 'idle') {
      setRemoteName(incomingCall.callerName);
      setCallState('incoming');
    }
  }, [incomingCall, callState]);

  // ── React to outgoingCall prop (initiates the call) ───────────────────────

  useEffect(() => {
    if (outgoingCall && callState === 'idle') {
      startCall(outgoingCall.targetUserId, outgoingCall.targetName, outgoingCall.roomId);
      onOutgoingCallHandled?.();
    }
  }, [outgoingCall]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle mic / camera ───────────────────────────────────────────────────

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsMuted((m) => !m);
  };

  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsCameraOff((c) => !c);
  };

  const formatDuration = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Render: idle → nothing ────────────────────────────────────────────────

  if (callState === 'idle') return null;

  // ── Render: incoming ring UI ──────────────────────────────────────────────

  if (callState === 'incoming') {
    return (
      <>
        {/* Keyframe styles injected once */}
        <style>{`
          @keyframes call-fade-in {
            from { opacity: 0; transform: scale(0.92); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes ring-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.7); }
            50%       { box-shadow: 0 0 0 18px rgba(59,130,246,0); }
          }
          @keyframes accept-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.8); transform: scale(1); }
            50%       { box-shadow: 0 0 0 12px rgba(34,197,94,0); transform: scale(1.07); }
          }
          .call-modal-enter {
            animation: call-fade-in 0.25s cubic-bezier(0.34,1.56,0.64,1) both;
          }
          .avatar-ring {
            animation: ring-pulse 1.4s ease-in-out infinite;
          }
          .accept-ring {
            animation: accept-pulse 1.0s ease-in-out infinite;
          }
        `}</style>

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="call-modal-enter bg-white dark:bg-slate-800 rounded-2xl p-8 flex flex-col items-center gap-6 shadow-2xl w-80 border border-slate-200 dark:border-slate-700">
            {/* Pulsing avatar ring */}
            <div className="relative flex items-center justify-center">
              {/* Outer glow ring */}
              <div className="absolute w-24 h-24 rounded-full bg-blue-500/20 avatar-ring" />
              <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-3xl z-10">
                📞
              </div>
            </div>

            <div className="text-center">
              <p className="text-slate-900 dark:text-white text-xl font-semibold">{remoteName}</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 flex items-center justify-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Incoming video call…
              </p>
            </div>

            <div className="flex gap-6">
              {/* Decline */}
              <button
                onClick={() => {
                  cleanup();
                  setCallState('idle');
                  onIncomingCallHandled();
                }}
                className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 flex items-center justify-center text-white text-2xl transition-all duration-150"
                title="Decline"
              >
                📵
              </button>
              {/* Accept — green pulse */}
              <button
                onClick={acceptCall}
                className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 active:scale-95 flex items-center justify-center text-white text-2xl transition-all duration-150 accept-ring"
                title="Accept"
              >
                📞
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Render: calling (outgoing ringing) ────────────────────────────────────

  if (callState === 'calling') {
    return (
      <>
        <style>{`
          @keyframes call-fade-in {
            from { opacity: 0; transform: scale(0.92); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes calling-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(168,85,247,0.7); }
            50%       { box-shadow: 0 0 0 18px rgba(168,85,247,0); }
          }
          .call-modal-enter { animation: call-fade-in 0.25s cubic-bezier(0.34,1.56,0.64,1) both; }
          .calling-ring { animation: calling-pulse 1.4s ease-in-out infinite; }
        `}</style>

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="call-modal-enter bg-white dark:bg-slate-800 rounded-2xl p-8 flex flex-col items-center gap-6 shadow-2xl w-80 border border-slate-200 dark:border-slate-700">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-24 h-24 rounded-full bg-purple-500/20 calling-ring" />
              <div className="w-20 h-20 rounded-full bg-purple-600 flex items-center justify-center text-3xl z-10">
                📞
              </div>
            </div>

            <div className="text-center">
              <p className="text-slate-900 dark:text-white text-xl font-semibold">{remoteName}</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Calling…</p>
            </div>

            <button
              onClick={() => endCall(true)}
              className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 flex items-center justify-center text-white text-2xl transition-all duration-150"
              title="Cancel call"
            >
              📵
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Render: active call (full-screen video) ───────────────────────────────

  return (
    <>
      <style>{`
        @keyframes call-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .call-active-enter { animation: call-fade-in 0.3s ease both; }
      `}</style>

      <div className="call-active-enter fixed inset-0 z-50 bg-slate-900 flex flex-col">
        {/* Remote video (full screen) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Dark gradient overlay at top + bottom for legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60 pointer-events-none" />

        {/* Overlay content */}
        <div className="relative z-10 flex flex-col h-full">
          <div className="p-6">
            <p className="text-white text-xl font-semibold drop-shadow">{remoteName}</p>
            <p className="text-green-300 text-sm drop-shadow font-mono">
              {formatDuration(callDuration)}
            </p>
          </div>

          {/* Local video (picture-in-picture) */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute top-4 right-4 w-32 h-24 rounded-xl object-cover border-2 border-slate-600 dark:border-slate-600 shadow-lg"
          />

          <div className="flex-1" />

          {/* Controls */}
          <div className="flex justify-center gap-6 pb-12">
            <button
              onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all duration-150 active:scale-95 ${
                isMuted
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-slate-700/80 hover:bg-slate-600'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🎤'}
            </button>
            <button
              onClick={toggleCamera}
              className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all duration-150 active:scale-95 ${
                isMuted
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-slate-700/80 hover:bg-slate-600'
              }`}
              title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
            >
              {isCameraOff ? '📵' : '📷'}
            </button>
            <button
              onClick={() => endCall(true)}
              className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 flex items-center justify-center text-xl transition-all duration-150"
              title="End call"
            >
              📞
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
