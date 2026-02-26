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

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
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
      // Attach remote audio track to a hidden audio element
      const audio = document.createElement('audio');
      audio.srcObject = e.streams[0];
      audio.autoplay = true;
      audio.dataset.voiceUserId = targetUserId;
      document.body.appendChild(audio);
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
    // Remove injected audio element
    document.querySelector(`audio[data-voice-user-id="${userId}"]`)?.remove();
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
    <div className="border-t border-slate-200 dark:border-slate-700 mt-2">
      {/* Mic error toast */}
      {micError && (
        <div className="mx-3 mt-2 flex items-start gap-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500/40 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="flex-1">{micError}</span>
          <button onClick={() => setMicError(null)} className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors">✕</button>
        </div>
      )}
      {/* Voice channel header row */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide">
          <span>🔊</span>
          <span className="truncate">{channelName}</span>
          {participants.length > 0 && (
            <span className="text-slate-400 dark:text-slate-500">· {participants.length}</span>
          )}
        </div>
        {!joined ? (
          <button
            onClick={join}
            disabled={isConnecting}
            className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-wait text-white px-2 py-1 rounded transition-colors flex items-center gap-1"
          >
            {isConnecting ? (
              <>
                <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Connecting…
              </>
            ) : 'Join'}
          </button>
        ) : (
          <div className="flex items-center gap-1">
            {/* Recording duration timer */}
            <span className="text-xs text-green-600 dark:text-green-400 font-mono flex items-center gap-1 mr-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block"/>
              {String(Math.floor(recordingSeconds / 60)).padStart(2,'0')}:{String(recordingSeconds % 60).padStart(2,'0')}
            </span>
            <button
              onClick={toggleMute}
              className={`text-xs px-2 py-1 rounded transition-colors ${isMuted ? 'bg-red-600 text-white' : 'bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200'}`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🎤'}
            </button>
            <button
              onClick={leave}
              className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded transition-colors"
            >
              Leave
            </button>
          </div>
        )}
      </div>

      {/* Participant list */}
      {joined && participants.length > 0 && (
        <div className="px-4 pb-2 space-y-1">
          {participants.map((p, i) => (
            <div key={p.userId ?? i} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-xs text-white font-semibold">
                {(p.username ?? '?')[0].toUpperCase()}
              </div>
              <span className="truncate">{p.username}</span>
              {p.userId === currentUserId && isMuted && (
                <span className="text-red-400 text-xs">🔇</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
