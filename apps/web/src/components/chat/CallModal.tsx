'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

import { API_URL } from '@/lib/api';

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
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteUserIdRef = useRef<string>('');
  const roomIdRef = useRef<string>('');
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const acceptingRef = useRef<boolean>(false);
  const callingRef = useRef<boolean>(false);
  // Tracks whether we are in an active/calling/incoming state to prevent
  // premature endCall triggered by transient ICE disconnection events.
  const callActiveRef = useRef<boolean>(false);

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
    acceptingRef.current = false;
    callingRef.current = false;
    callActiveRef.current = false;
    remoteStreamRef.current = null;
  }, []);

  // ── Get user media ─────────────────────────────────────────────────────────

  const getMedia = useCallback(async (): Promise<MediaStream> => {
    try {
      console.log('[WebRTC] Requesting camera/mic permissions...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('[WebRTC] Got local media stream with', stream.getTracks().length, 'tracks');
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error('[WebRTC] Failed to get user media:', error);
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          console.error('[WebRTC] Camera/microphone permission DENIED by user');
          alert('Camera and microphone access is required for video calls. Please enable permissions in your browser settings.');
        } else if (error.name === 'NotFoundError') {
          console.error('[WebRTC] No camera/microphone found on device');
          alert('No camera or microphone found. Please connect a device and try again.');
        }
      }
      throw error;
    }
  }, []);

  // ── Create RTCPeerConnection ───────────────────────────────────────────────
  // role = 'caller'  → use addTransceiver (defines the offer structure)
  // role = 'receiver' → use addTrack (slots into transceivers from the remote offer)

  const createPeer = useCallback(
    (stream: MediaStream, role: 'caller' | 'receiver'): RTCPeerConnection => {
      const peer = new RTCPeerConnection(ICE_SERVERS);
      peerRef.current = peer;

      if (role === 'caller') {
        // Caller defines the transceiver structure that becomes the offer.
        console.log('[WebRTC] CALLER: Adding sendrecv transceivers for two-way media');
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        if (videoTrack) {
          console.log('[WebRTC] Adding video transceiver with track, sendrecv');
          peer.addTransceiver(videoTrack, { direction: 'sendrecv', streams: [stream] });
        }
        if (audioTrack) {
          console.log('[WebRTC] Adding audio transceiver with track, sendrecv');
          peer.addTransceiver(audioTrack, { direction: 'sendrecv', streams: [stream] });
        }
      } else {
        // Receiver must use addTrack so tracks slot into the transceivers
        // already described in the caller's offer (after setRemoteDescription).
        // addTransceiver here would create extra transceivers and break SDP matching.
        console.log('[WebRTC] RECEIVER: Adding local tracks via addTrack (slots into offer transceivers)');
        stream.getTracks().forEach((track) => {
          console.log('[WebRTC] addTrack:', track.kind);
          peer.addTrack(track, stream);
        });
      }

      peer.onicecandidate = (e) => {
        if (e.candidate && socket && remoteUserIdRef.current) {
          socket.emit('ice_candidate', {
            targetUserId: remoteUserIdRef.current,
            candidate: e.candidate.toJSON(),
          });
        }
      };

      peer.ontrack = (e) => {
        console.log('[WebRTC] Received remote track:', e.track.kind);
        if (e.streams && e.streams[0]) {
          remoteStreamRef.current = e.streams[0];
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = e.streams[0];
          }
        }
      };

      peer.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', peer.connectionState);
        if (peer.connectionState === 'connected') {
          callActiveRef.current = true;
          setCallState('active');
          onStopRingtone?.(); // stop outgoing ringtone — call is now live
          durationTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
        }
        // Only end the call on terminal states, and only after we were genuinely
        // connected. 'disconnected' during ICE negotiation is transient and must
        // NOT tear down the peer connection or reset the mutex refs.
        if (callActiveRef.current && ['disconnected', 'failed', 'closed'].includes(peer.connectionState)) {
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
      if (callingRef.current || acceptingRef.current) return; // already in a call
      callingRef.current = true;
      callActiveRef.current = false; // will be set true only on 'connected'
      remoteUserIdRef.current = targetUserId;
      roomIdRef.current = roomId;
      setRemoteName(targetName);
      setCallState('calling');

      try {
        const stream = await getMedia();
        const peer = createPeer(stream, 'caller');
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
    if (acceptingRef.current) return; // prevent double-invocation
    acceptingRef.current = true;
    remoteUserIdRef.current = incomingCall.callerId;
    roomIdRef.current = incomingCall.roomId;
    setRemoteName(incomingCall.callerName);
    setCallState('active');
    onStopRingtone?.(); // stop incoming ringtone
    onIncomingCallHandled();
    onOutgoingCallHandled?.(); // cancel any simultaneous outgoing call (collision)

    try {
      console.log('[WebRTC] RECEIVER: Starting accept call sequence');
      
      // Step 1: Get local media first
      console.log('[WebRTC] RECEIVER: Step 1 - Getting local media');
      const stream = await getMedia();
      
      // Step 2: Create peer connection (no tracks yet — must add AFTER setRemoteDescription)
      console.log('[WebRTC] RECEIVER: Step 2 - Creating peer connection');
      const peer = new RTCPeerConnection(ICE_SERVERS);
      peerRef.current = peer;

      peer.onicecandidate = (e) => {
        if (e.candidate && socket && remoteUserIdRef.current) {
          socket.emit('ice_candidate', {
            targetUserId: remoteUserIdRef.current,
            candidate: e.candidate.toJSON(),
          });
        }
      };

      peer.ontrack = (e) => {
        console.log('[WebRTC] Received remote track:', e.track.kind);
        if (e.streams && e.streams[0]) {
          remoteStreamRef.current = e.streams[0];
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = e.streams[0];
          }
        }
      };

      peer.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', peer.connectionState);
        if (peer.connectionState === 'connected') {
          callActiveRef.current = true;
          setCallState('active');
          onStopRingtone?.();
          durationTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
        }
        // Only tear down on terminal states AFTER we were genuinely connected.
        // 'disconnected' during ICE is transient and must not reset mutex refs.
        if (callActiveRef.current && ['disconnected', 'failed', 'closed'].includes(peer.connectionState)) {
          endCall(false);
        }
      };

      // Step 3: Set remote description (the caller's offer) FIRST
      console.log('[WebRTC] RECEIVER: Step 3 - Setting remote description (caller offer)');
      await peer.setRemoteDescription(new RTCSessionDescription(incomingCall.sdp));

      // Step 3b: NOW add local tracks via addTrack so they slot into the
      // transceivers created by the caller's offer (not new ones).
      console.log('[WebRTC] RECEIVER: Step 3b - Adding local tracks into offer transceivers');
      stream.getTracks().forEach((track) => {
        console.log('[WebRTC] RECEIVER: addTrack', track.kind);
        peer.addTrack(track, stream);
      });

      // Step 4: Flush any ICE candidates that arrived before remote description was set
      console.log('[WebRTC] RECEIVER: Step 4 - Flushing', pendingIceCandidatesRef.current.length, 'pending ICE candidates');
      for (const c of pendingIceCandidatesRef.current) {
        await peer.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingIceCandidatesRef.current = [];

      // Step 5: Create answer AFTER tracks are added and remote description is set
      console.log('[WebRTC] RECEIVER: Step 5 - Creating answer (tracks already added)');
      const answer = await peer.createAnswer();
      console.log('[WebRTC] RECEIVER: Step 6 - Setting local description (answer)');
      await peer.setLocalDescription(answer);

      socket.emit('call_answer', {
        targetUserId: incomingCall.callerId,
        sdp: answer,
      });
      // Note: durationTimerRef is started inside onconnectionstatechange → 'connected'
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
    if (outgoingCall && callState === 'idle' && !acceptingRef.current && !callingRef.current) {
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
          ref={(el) => {
            remoteVideoRef.current = el;
            // If ontrack already fired before this element mounted (e.g. on the
            // caller side where callState was 'calling' when the answer arrived),
            // assign the stored stream now so it is never lost.
            if (el && remoteStreamRef.current) {
              el.srcObject = remoteStreamRef.current;
            }
          }}
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
            className="absolute top-4 right-4 w-32 h-24 rounded-2xl object-cover border border-white/20 dark:border-white/10 shadow-2xl shadow-black/60"
          />

          <div className="flex-1" />

          {/* Controls */}
          <div className="flex justify-center gap-6 pb-12">
            {/* Mute button */}
            <button
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90 ${
                isMuted
                  ? 'bg-red-500/90 hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] ring-1 ring-red-400/40'
                  : 'bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10'
              }`}
            >
              {isMuted ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>
            {/* Camera button */}
            <button
              onClick={toggleCamera}
              title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90 ${
                isCameraOff
                  ? 'bg-red-500/90 hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)] ring-1 ring-red-400/40'
                  : 'bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10'
              }`}
            >
              {isCameraOff ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8zM3 3l18 18" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
              )}
            </button>
            {/* End call button */}
            <button
              onClick={() => endCall(true)}
              title="End call"
              className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-400 active:scale-90 flex items-center justify-center transition-all duration-150 shadow-[0_0_24px_rgba(239,68,68,0.6)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
