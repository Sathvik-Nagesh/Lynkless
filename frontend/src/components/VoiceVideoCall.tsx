'use client';

import { useState, useCallback, useRef, memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface VoiceVideoCallProps {
  peerId: string;
  peerName: string;
  isConnected: boolean;
  onCallStart: (stream: MediaStream, type: 'audio' | 'video') => void;
  onCallEnd: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

export const VoiceVideoCall = memo(function VoiceVideoCall({
  peerId,
  peerName,
  isConnected,
  onCallStart,
  onCallEnd,
  localStream,
  remoteStream,
}: VoiceVideoCallProps) {
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const startCall = useCallback(async (type: 'audio' | 'video') => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: type === 'video' ? { width: 1280, height: 720 } : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCallType(type);
      onCallStart(stream, type);

      if (localVideoRef.current && type === 'video') {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Failed to start call:', err);
    }
  }, [onCallStart]);

  // Attach remote stream to audio/video elements whenever it changes
  useEffect(() => {
    if (remoteStream) {
      if (callType === 'video' && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
    }
  }, [remoteStream, callType]);

  const endCall = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setCallType(null);
    setIsMuted(false);
    setIsCameraOff(false);
    onCallEnd();
  }, [localStream, onCallEnd]);

  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  }, [localStream, isMuted]);

  const toggleCamera = useCallback(() => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsCameraOff(!isCameraOff);
    }
  }, [localStream, isCameraOff]);

  if (!isConnected) {
    return (
      <div className="p-4 rounded-xl bg-[#111] border border-[#27272a]">
        <p className="text-sm text-[#71717a] text-center">Connect to a peer to start a call</p>
      </div>
    );
  }

  if (callType) {
    return (
      <motion.div
        className="rounded-xl overflow-hidden bg-[#111] border border-[#27272a]"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <div className="relative aspect-video bg-[#1f1f1f]">
          {remoteStream && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
              onLoadedMetadata={() => {
                if (remoteVideoRef.current) {
                  remoteVideoRef.current.srcObject = remoteStream;
                }
              }}
            />
          )}
          
          {callType === 'video' && localStream && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-4 right-4 w-32 h-24 rounded-lg object-cover border-2 border-[#27272a]"
            />
          )}

          {callType === 'audio' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-[#27272a] flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-[#a1a1aa]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p className="text-[#ededed] font-medium">{peerName}</p>
              <p className="text-sm text-[#71717a]">Voice call in progress</p>
            </div>
          )}
          {/* Hidden audio element for remote voice stream */}
          <audio ref={remoteAudioRef} autoPlay playsInline />
        </div>

        <div className="p-4 flex items-center justify-center gap-4">
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full transition-colors ${
              isMuted ? 'bg-red-500/20 text-red-400' : 'bg-[#1f1f1f] text-[#a1a1aa] hover:bg-[#27272a]'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>

          {callType === 'video' && (
            <button
              onClick={toggleCamera}
              className={`p-3 rounded-full transition-colors ${
                isCameraOff ? 'bg-red-500/20 text-red-400' : 'bg-[#1f1f1f] text-[#a1a1aa] hover:bg-[#27272a]'
              }`}
              title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
            >
              {isCameraOff ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}

          <button
            onClick={endCall}
            className="p-3 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
            title="End call"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
            </svg>
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-[#111] border border-[#27272a]">
      <p className="text-sm text-[#a1a1aa] text-center mb-3">Start a call with {peerName}</p>
      <div className="flex gap-3">
        <button
          onClick={() => startCall('audio')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#1f1f1f] text-[#ededed] hover:bg-[#27272a] transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          Voice Call
        </button>
        <button
          onClick={() => startCall('video')}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#1f1f1f] text-[#ededed] hover:bg-[#27272a] transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Video Call
        </button>
      </div>
    </div>
  );
});
