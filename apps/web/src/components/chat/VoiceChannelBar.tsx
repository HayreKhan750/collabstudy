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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      socket.emit('join_voice_channel', { channelId });
      setJoined(true);
    } catch {
      alert('Could not access microphone. Please check browser permissions.');
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
    <div className="border-t border-gray-700 mt-2">
      {/* Voice channel header row */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold uppercase tracking-wide">
          <span>🔊</span>
          <span className="truncate">{channelName}</span>
          {participants.length > 0 && (
            <span className="text-gray-500">· {participants.length}</span>
          )}
        </div>
        {!joined ? (
          <button
            onClick={join}
            className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded transition-colors"
          >
            Join
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={toggleMute}
              className={`text-xs px-2 py-1 rounded transition-colors ${isMuted ? 'bg-red-600 text-white' : 'bg-gray-600 hover:bg-gray-500 text-gray-200'}`}
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
            <div key={p.userId ?? i} className="flex items-center gap-2 text-sm text-gray-300">
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
