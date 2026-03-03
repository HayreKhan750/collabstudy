'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

import { API_URL } from '@/lib/api';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    // Free TURN servers for NAT traversal (strong connection across networks)
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

// High-quality audio constraints — noise suppression, echo cancellation, no AGC distortion
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  sampleSize: 16,
  channelCount: 1, // mono for voice — cleaner than stereo for calls
};

// High-quality video constraints (no facingMode here — passed per call)
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 60 },
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
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const videoDevicesRef = useRef<MediaDeviceInfo[]>([]);
  const currentDeviceIdRef = useRef<string>('');
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

  const getMedia = useCallback(async (videoConstraints: MediaTrackConstraints = VIDEO_CONSTRAINTS): Promise<MediaStream> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: AUDIO_CONSTRAINTS,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      // Store current deviceId for camera switching
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) currentDeviceIdRef.current = videoTrack.getSettings().deviceId ?? '';
      // Enumerate cameras AFTER getUserMedia — labels only available post-permission
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        videoDevicesRef.current = videoInputs;
        setHasMultipleCameras(videoInputs.length >= 2);
      }).catch(() => {});
      return stream;
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          alert('Camera and microphone access is required for video calls. Please enable permissions in your browser settings.');
        } else if (error.name === 'NotFoundError') {
          alert('No camera or microphone found. Please connect a device and try again.');
        } else if (error.name === 'OverconstrainedError') {
          // Device can't meet ideal constraints — fall back to basic
          const fallback = await navigator.mediaDevices.getUserMedia({ video: true, audio: AUDIO_CONSTRAINTS });
          localStreamRef.current = fallback;
          if (localVideoRef.current) localVideoRef.current.srcObject = fallback;
          return fallback;
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
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];
        if (videoTrack) {
          const videoTransceiver = peer.addTransceiver(videoTrack, { direction: 'sendrecv', streams: [stream] });
          // Prefer VP9 (best quality/compression), fallback to H264, then VP8
          const videoCapabilities = RTCRtpSender.getCapabilities('video');
          if (videoCapabilities) {
            const preferredCodecs = [
              ...videoCapabilities.codecs.filter(c => c.mimeType === 'video/VP9'),
              ...videoCapabilities.codecs.filter(c => c.mimeType === 'video/H264'),
              ...videoCapabilities.codecs.filter(c => c.mimeType === 'video/VP8'),
              ...videoCapabilities.codecs.filter(c => !['video/VP9','video/H264','video/VP8'].includes(c.mimeType)),
            ];
            if (preferredCodecs.length) videoTransceiver.setCodecPreferences(preferredCodecs);
          }
          // Set high video bitrate: 2.5 Mbps target, 4 Mbps max
          const videoSender = videoTransceiver.sender;
          const videoParams = videoSender.getParameters();
          if (!videoParams.encodings || videoParams.encodings.length === 0) videoParams.encodings = [{}];
          videoParams.encodings[0].maxBitrate = 4_000_000;
          videoParams.encodings[0].scaleResolutionDownBy = 1.0;
          videoSender.setParameters(videoParams).catch(() => {});
        }
        if (audioTrack) {
          const audioTransceiver = peer.addTransceiver(audioTrack, { direction: 'sendrecv', streams: [stream] });
          // Prefer Opus — best audio codec for WebRTC (low latency, noise robust)
          const audioCapabilities = RTCRtpSender.getCapabilities('audio');
          if (audioCapabilities) {
            const preferredAudioCodecs = [
              ...audioCapabilities.codecs.filter(c => c.mimeType === 'audio/opus'),
              ...audioCapabilities.codecs.filter(c => c.mimeType !== 'audio/opus'),
            ];
            if (preferredAudioCodecs.length) audioTransceiver.setCodecPreferences(preferredAudioCodecs);
          }
          // Set high audio bitrate: 128 kbps (music/HD voice quality)
          const audioSender = audioTransceiver.sender;
          const audioParams = audioSender.getParameters();
          if (!audioParams.encodings || audioParams.encodings.length === 0) audioParams.encodings = [{}];
          audioParams.encodings[0].maxBitrate = 128_000;
          audioSender.setParameters(audioParams).catch(() => {});
        }
      } else {
        // Receiver must use addTrack so tracks slot into the transceivers
        // already described in the caller's offer (after setRemoteDescription).
        // addTransceiver here would create extra transceivers and break SDP matching.
        stream.getTracks().forEach((track) => {
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
        if (e.streams && e.streams[0]) {
          remoteStreamRef.current = e.streams[0];
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = e.streams[0];
          }
        }
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') {
          callActiveRef.current = true;
          setCallState('active');
          onStopRingtone?.(); // stop outgoing ringtone — call is now live
          durationTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
          // Boost sender bitrates after connection (works for both caller & receiver)
          peer.getSenders().forEach((sender) => {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
            if (sender.track?.kind === 'video') {
              params.encodings[0].maxBitrate = 4_000_000;
              params.encodings[0].scaleResolutionDownBy = 1.0;
            } else if (sender.track?.kind === 'audio') {
              params.encodings[0].maxBitrate = 128_000;
            }
            sender.setParameters(params).catch(() => {});
          });
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
      
      // Step 1: Get local media first
      const stream = await getMedia();
      
      // Step 2: Create peer connection (no tracks yet — must add AFTER setRemoteDescription)
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
        if (e.streams && e.streams[0]) {
          remoteStreamRef.current = e.streams[0];
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = e.streams[0];
          }
        }
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') {
          callActiveRef.current = true;
          setCallState('active');
          onStopRingtone?.();
          durationTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
          // Boost sender bitrates after connection
          peer.getSenders().forEach((sender) => {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
            if (sender.track?.kind === 'video') {
              params.encodings[0].maxBitrate = 4_000_000;
              params.encodings[0].scaleResolutionDownBy = 1.0;
            } else if (sender.track?.kind === 'audio') {
              params.encodings[0].maxBitrate = 128_000;
            }
            sender.setParameters(params).catch(() => {});
          });
        }
        // Only tear down on terminal states AFTER we were genuinely connected.
        // 'disconnected' during ICE is transient and must not reset mutex refs.
        if (callActiveRef.current && ['disconnected', 'failed', 'closed'].includes(peer.connectionState)) {
          endCall(false);
        }
      };

      // Step 3: Set remote description (the caller's offer) FIRST
      await peer.setRemoteDescription(new RTCSessionDescription(incomingCall.sdp));

      // Step 3b: NOW add local tracks via addTrack so they slot into the
      // transceivers created by the caller's offer (not new ones).
      stream.getTracks().forEach((track) => {
        peer.addTrack(track, stream);
      });

      // Step 4: Flush any ICE candidates that arrived before remote description was set
      for (const c of pendingIceCandidatesRef.current) {
        await peer.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingIceCandidatesRef.current = [];

      // Step 5: Create answer AFTER tracks are added and remote description is set
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit('call_answer', {
        targetUserId: incomingCall.callerId,
        sdp: answer,
      });
      // Note: durationTimerRef is started inside onconnectionstatechange → 'connected'
    } catch (err) {
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

  const switchCamera = useCallback(async () => {
    const devices = videoDevicesRef.current;
    console.log('[CAM] devices:', devices.map(d => ({ id: d.deviceId, label: d.label })));
    console.log('[CAM] currentId:', currentDeviceIdRef.current);
    console.log('[CAM] hasMultipleCameras:', hasMultipleCameras);
    if (devices.length < 2) return;

    // Find the next camera deviceId (cycle through all video devices)
    const currentId = currentDeviceIdRef.current;
    const currentIndex = devices.findIndex((d) => d.deviceId === currentId);
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDevice = devices[nextIndex];
    if (!nextDevice) return;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextDevice.deviceId } },
        audio: false,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      // Replace track on peer connection without renegotiation
      if (peerRef.current) {
        const sender = peerRef.current.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(newVideoTrack);
      }

      // Stop old video track and swap in new one
      localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => localStreamRef.current!.removeTrack(t));
        localStreamRef.current.addTrack(newVideoTrack);
      }

      // Update local preview
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;

      console.log('[CAM] switched to:', nextDevice.label, nextDevice.deviceId);
      // Update tracking refs and state
      currentDeviceIdRef.current = nextDevice.deviceId;
      // Determine facing mode from track label or settings
      const settings = newVideoTrack.getSettings();
      const newFacing = (settings as { facingMode?: string }).facingMode === 'environment'
        ? 'environment'
        : 'user';
      setFacingMode(newFacing);
    } catch (err) {
      console.log('[CAM] exact deviceId failed:', err);
      // If exact deviceId fails, try facingMode as last resort
      const nextFacing = facingMode === 'user' ? 'environment' : 'user';
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: nextFacing },
          audio: false,
        });
        const track = fallbackStream.getVideoTracks()[0];
        if (!track) return;
        if (peerRef.current) {
          const sender = peerRef.current.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(track);
        }
        localStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach((t) => localStreamRef.current!.removeTrack(t));
          localStreamRef.current.addTrack(track);
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
        currentDeviceIdRef.current = track.getSettings().deviceId ?? '';
        setFacingMode(nextFacing);
      } catch (fallbackErr) { console.log('[CAM] fallback also failed:', fallbackErr); }
    }
  }, [facingMode]);

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
            {/* Flip camera button — only shown on devices with 2+ cameras (smartphones) */}
            {hasMultipleCameras && (
              <button
                onClick={switchCamera}
                title={facingMode === 'user' ? 'Switch to back camera' : 'Switch to front camera'}
                className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 flex items-center justify-center transition-all duration-150 active:scale-90"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
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
