'use client';

import { useState, useRef, useEffect } from 'react';

interface RecordingStatus {
  type: 'idle' | 'recording' | 'uploading' | 'success' | 'error';
  message: string;
}

export default function CameraPage() {
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [status, setStatus] = useState<RecordingStatus>({ type: 'idle', message: '' });
  const [chunks, setChunks] = useState<Blob[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const DURATION_MS = 30000; // 30 seconds

  // Cleanup function
  const cleanup = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, []);

  const formatTime = (seconds: number) => {
    return `${seconds}s`;
  };

  const startCountdown = () => {
    setTimeLeft(30);
    countdownRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const getStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      });
      return stream;
    } catch (error) {
      throw new Error('Unable to access camera and microphone. Please check permissions.');
    }
  };

  const testCamera = async () => {
    try {
      setStatus({ type: 'idle', message: 'Testing camera access...' });
      
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
      
      const stream = await getStream();
      setMediaStream(stream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      setStatus({ type: 'success', message: 'Camera access successful! You can now start recording.' });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to access camera' });
    }
  };

  const startRecording = async () => {
    try {
      setIsRecording(true);
      setStatus({ type: 'recording', message: 'Starting recording...' });
      setChunks([]);

      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }

      const stream = await getStream();
      setMediaStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Choose the best supported mime type
      let mimeType = '';
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        mimeType = 'video/webm;codecs=vp8';
      } else if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E')) {
        mimeType = 'video/mp4;codecs=avc1.42E01E';
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      setMediaRecorder(recorder);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          setChunks(prev => [...prev, event.data]);
        }
      };

      recorder.onstart = () => {
        setStatus({ type: 'recording', message: 'Recording in progress...' });
        startCountdown();
      };

      recorder.onerror = (event) => {
        setStatus({ type: 'error', message: `Recording error: ${event.error?.message || 'Unknown error'}` });
        setIsRecording(false);
      };

      recorder.onstop = async () => {
        setStatus({ type: 'uploading', message: 'Processing and uploading video...' });
        
        const blob = new Blob(chunks, { 
          type: recorder.mimeType || 'video/webm' 
        });
        
        const file = new File([blob], `recording-${Date.now()}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`, {
          type: blob.type
        });

        try {
          const formData = new FormData();
          formData.append('video', file);

          const response = await fetch('/api/camera/upload', {
            method: 'POST',
            body: formData
          });

          const result = await response.json();

          if (!response.ok || !result.success) {
            throw new Error(result.error || 'Upload failed');
          }

          setStatus({ 
            type: 'success', 
            message: `Video uploaded successfully! File: ${result.data.fileName}` 
          });
        } catch (error) {
          setStatus({ 
            type: 'error', 
            message: `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
          });
        } finally {
          setIsRecording(false);
          setTimeLeft(30);
          cleanup();
        }
      };

      recorder.start();
      
      // Auto-stop after 30 seconds
      recordingTimeoutRef.current = setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, DURATION_MS);

    } catch (error) {
      setStatus({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to start recording' 
      });
      setIsRecording(false);
      cleanup();
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    
    setIsRecording(false);
    setTimeLeft(30);
  };

  const getStatusIcon = () => {
    switch (status.type) {
      case 'success':
        return <span className="text-green-500">✓</span>;
      case 'error':
        return <span className="text-red-500">⚠</span>;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (status.type) {
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'recording':
        return 'text-blue-600';
      case 'uploading':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            📹 Camera Recording
          </h1>
          <p className="text-gray-600">
            Record a 30-second video using your camera and microphone. 
            Your browser will ask for permission to access your camera and microphone.
          </p>
        </div>
        <div className="space-y-6">
          {/* Video Preview */}
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full max-w-2xl mx-auto bg-black rounded-lg"
              style={{ aspectRatio: '16/9' }}
            />
            {isRecording && (
              <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                REC
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-4 items-center justify-center">
            <button
              onClick={testCamera}
              disabled={isRecording}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              📷 Test Camera
            </button>

            <button
              onClick={startRecording}
              disabled={isRecording}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              ▶️ Start Recording (30s)
            </button>

            <button
              onClick={stopRecording}
              disabled={!isRecording}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              ⏹️ Stop Recording
            </button>

            {isRecording && (
              <div className="text-lg font-mono font-semibold text-red-500">
                Time left: {formatTime(timeLeft)}
              </div>
            )}
          </div>

          {/* Status */}
          {status.message && (
            <div className={`p-4 rounded-md border ${
              status.type === 'error' ? 'border-red-200 bg-red-50' : 
              status.type === 'success' ? 'border-green-200 bg-green-50' : 
              'border-blue-200 bg-blue-50'
            }`}>
              <div className="flex items-center gap-2">
                {getStatusIcon()}
                <p className={getStatusColor()}>
                  {status.message}
                </p>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="text-sm text-gray-600 space-y-2">
            <p><strong>Instructions:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Click "Test Camera" to check if your camera and microphone are working</li>
              <li>Click "Start Recording" to begin a 30-second recording</li>
              <li>The recording will automatically stop after 30 seconds</li>
              <li>You can manually stop the recording by clicking "Stop Recording"</li>
              <li>The video will be automatically uploaded to your account</li>
            </ul>
            <p className="text-xs text-gray-500 mt-4">
              <strong>Note:</strong> Camera access requires HTTPS in production or localhost for development.
              On iOS/Safari, recording may produce MP4 files instead of WebM.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
