'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';

interface Participant {
  userId: string;
  username: string;
  socketId: string;
}

interface VoiceChannelBarProps {
  channelId: string;
  channelName: string;
  socket: Socket | null;
  currentUserId: string;
  currentUsername: string;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

export default function VoiceChannelBar({
  channelId,
  channelName,
  socket,
  currentUserId,
  currentUsername,
}: VoiceChannelBarProps) {
  const [joined, setJoined] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  // Remote streams: userId → MediaStream. Stored in a ref for immediate access
  // and mirrored into state so React re-renders the <audio> elements.
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  // ── Peer management ────────────────────────────────────────────────────────

  const createPeer = useCallback((targetUserId: string, initiator: boolean): RTCPeerConnection => {
    const peer = new RTCPeerConnection(ICE_SERVERS);

    localStreamRef.current?.getTracks().forEach(t => {
      peer.addTrack(t, localStreamRef.current!);
    });

    peer.onicecandidate = (e) => {
      if (e.candidate && socket) {
        socket.emit('ice_candidate', {
          targetUserId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    peer.ontrack = (e) => {
      // Store the remote stream and trigger React re-render so the
      // <audio> element in JSX gets the srcObject assigned via callback ref.
      if (e.streams && e.streams[0]) {
        remoteStreamsRef.current.set(targetUserId, e.streams[0]);
        setRemoteStreams(new Map(remoteStreamsRef.current));
      }
    };

    peer.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(peer.connectionState)) {
        cleanupPeer(targetUserId);
      }
    };

    peersRef.current.set(targetUserId, peer);
    return peer;
  }, [socket]);

  const cleanupPeer = (userId: string) => {
    peersRef.current.get(userId)?.close();
    peersRef.current.delete(userId);
    remoteStreamsRef.current.delete(userId);
    setRemoteStreams(new Map(remoteStreamsRef.current));
  };

  // ── Join voice channel ─────────────────────────────────────────────────────

  const join = useCallback(async () => {
    if (!socket) return;
    setIsConnecting(true);
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      socket.emit('join_voice_channel', { channelId });
      setJoined(true);
      // Start recording duration timer
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      const isDenied =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      const msg = isDenied
        ? '🎤 Microphone access denied. Please allow microphone permissions in your browser settings and try again.'
        : '🎤 Could not access microphone. Please check that a microphone is connected and try again.';
      console.error('[VoiceChannel] getUserMedia failed:', err);
      setMicError(msg);
    } finally {
      setIsConnecting(false);
    }
  }, [socket, channelId]);

  // ── Leave voice channel ────────────────────────────────────────────────────

  const leave = useCallback(() => {
    if (!socket) return;
    socket.emit('leave_voice_channel', { channelId });
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    for (const [uid] of peersRef.current) cleanupPeer(uid);
    peersRef.current.clear();
    remoteStreamsRef.current.clear();
    setRemoteStreams(new Map());
    // Stop recording timer
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingSeconds(0);
    setJoined(false);
    setParticipants([]);
  }, [socket, channelId]);

  // ── Socket event listeners ─────────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const onRoomState = (data: { channelId: string; participants: Participant[] }) => {
      if (data.channelId === channelId) setParticipants(data.participants);
    };

    const onParticipantJoined = (data: { userId: string; username: string; channelId: string }) => {
      if (data.channelId !== channelId) return;
      setParticipants(prev => {
        if (prev.find(p => p.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, username: data.username, socketId: '' }];
      });
    };

    const onParticipantLeft = (data: { userId: string; channelId: string }) => {
      if (data.channelId !== channelId) return;
      cleanupPeer(data.userId);
      setParticipants(prev => prev.filter(p => p.userId !== data.userId));
    };

    // Server tells us to initiate an offer to an existing participant
    const onOfferNeeded = async (data: { targetUserId: string; channelId: string }) => {
      if (data.channelId !== channelId || !joined) return;
      const peer = createPeer(data.targetUserId, true);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('call_offer', {
        targetUserId: data.targetUserId,
        sdp: offer,
        callType: 'channel',
        roomId: channelId,
        callerId: currentUserId,
        callerName: currentUsername,
      });
    };

    const onCallOffer = async (payload: { sdp: RTCSessionDescriptionInit; callerId: string; callType: string; roomId: string }) => {
      if (payload.callType !== 'channel' || payload.roomId !== channelId || !joined) return;
      const peer = createPeer(payload.callerId, false);
      await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));

      // Flush pending ICE
      const pending = pendingCandidatesRef.current.get(payload.callerId) ?? [];
      for (const c of pending) await peer.addIceCandidate(new RTCIceCandidate(c));
      pendingCandidatesRef.current.delete(payload.callerId);

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('call_answer', { targetUserId: payload.callerId, sdp: answer });
    };

    const onCallAnswer = async (payload: { sdp: RTCSessionDescriptionInit; fromUserId: string }) => {
      const peer = peersRef.current.get(payload.fromUserId);
      if (!peer) return;
      await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const pending = pendingCandidatesRef.current.get(payload.fromUserId) ?? [];
      for (const c of pending) await peer.addIceCandidate(new RTCIceCandidate(c));
      pendingCandidatesRef.current.delete(payload.fromUserId);
    };

    const onIceCandidate = async (payload: { candidate: RTCIceCandidateInit; fromUserId: string }) => {
      const peer = peersRef.current.get(payload.fromUserId);
      if (peer?.remoteDescription) {
        await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } else {
        const arr = pendingCandidatesRef.current.get(payload.fromUserId) ?? [];
        arr.push(payload.candidate);
        pendingCandidatesRef.current.set(payload.fromUserId, arr);
      }
    };

    socket.on('voice_room_state', onRoomState);
    socket.on('voice_participant_joined', onParticipantJoined);
    socket.on('voice_participant_left', onParticipantLeft);
    socket.on('call_offer_needed', onOfferNeeded);
    socket.on('call_offer', onCallOffer);
    socket.on('call_answer', onCallAnswer);
    socket.on('ice_candidate', onIceCandidate);

    return () => {
      socket.off('voice_room_state', onRoomState);
      socket.off('voice_participant_joined', onParticipantJoined);
      socket.off('voice_participant_left', onParticipantLeft);
      socket.off('call_offer_needed', onOfferNeeded);
      socket.off('call_offer', onCallOffer);
      socket.off('call_answer', onCallAnswer);
      socket.off('ice_candidate', onIceCandidate);
    };
  }, [socket, channelId, joined, createPeer, currentUserId, currentUsername]);

  // Cleanup on unmount
  useEffect(() => () => { if (joined) leave(); }, []);

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mt-2 mx-2 mb-1">
      {/* Hidden audio elements — one per remote user. Callback ref assigns
          srcObject properly (cannot use src= attribute for MediaStream in React).
          Rendered in React DOM so browser autoplay policies are satisfied
          since connection starts from explicit user "Join" click. */}
      {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
        <audio
          key={userId}
          autoPlay
          playsInline
          ref={(el) => {
            if (el && el.srcObject !== stream) {
              el.srcObject = stream;
            }
          }}
          style={{ display: 'none' }}
        />
      ))}
      {/* Mic error toast */}
      {micError && (
        <div className="mb-2 flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-xl px-3 py-2 text-xs text-red-700 dark:text-red-300 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="flex-1">{micError}</span>
          <button onClick={() => setMicError(null)} className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors active:scale-95">✕</button>
        </div>
      )}

      {/* Voice channel floating pill card */}
      <div className="bg-white/60 dark:bg-gray-800/50 border border-gray-200/80 dark:border-white/[0.06] rounded-xl px-3 py-2 shadow-sm backdrop-blur-sm">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 9v6m-3.536-6.536a5 5 0 000 7.072M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="truncate max-w-[80px]">{channelName}</span>
            {participants.length > 0 && (
              <span className="text-slate-400 dark:text-slate-500 font-normal">· {participants.length}</span>
            )}
          </div>

          {!joined ? (
            <button
              onClick={join}
              disabled={isConnecting}
              className="text-xs bg-green-500 hover:bg-green-400 active:scale-95 disabled:opacity-60 disabled:cursor-wait text-white px-2.5 py-1 rounded-lg transition-all duration-150 flex items-center gap-1 font-medium shadow-sm"
            >
              {isConnecting ? (
                <>
                  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Joining…
                </>
              ) : 'Join'}
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              {/* Live timer */}
              <span className="text-xs text-green-600 dark:text-green-400 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block"/>
                {String(Math.floor(recordingSeconds / 60)).padStart(2,'0')}:{String(recordingSeconds % 60).padStart(2,'0')}
              </span>
              {/* Mute button */}
              <button
                onClick={toggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
                className={`p-1.5 rounded-lg transition-all duration-150 active:scale-90 ${
                  isMuted
                    ? 'bg-red-400/15 text-red-400 hover:bg-red-400/25 ring-1 ring-red-400/30'
                    : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20'
                }`}
              >
                {isMuted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </button>
              {/* Leave button */}
              <button
                onClick={leave}
                title="Leave voice"
                className="p-1.5 rounded-lg bg-red-400/15 text-red-400 hover:bg-red-400/25 ring-1 ring-red-400/30 transition-all duration-150 active:scale-90"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Participant list */}
        {joined && participants.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-gray-100 dark:border-white/[0.05] pt-2">
            {participants.map((p, i) => (
              <div key={p.userId ?? i} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-[10px] text-white font-semibold flex-shrink-0">
                  {(p.username ?? '?')[0].toUpperCase()}
                </div>
                <span className="truncate flex-1">{p.username}</span>
                {p.userId === currentUserId && isMuted && (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
