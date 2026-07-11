import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, X } from 'lucide-react';

/**
 * WebcamCapture — opens a live video stream from the user's camera
 * (built-in or USB webcam) and captures a single frame as base64.
 */
export default function WebcamCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError('Camera not available. Please check permissions.');
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      // Cleanup: stop all tracks when unmounting
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Ensure video element gets the stream when ref is ready
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // Stop stream
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    onCapture(dataUrl);
  };

  const handleCancel = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    onCancel();
  };

  if (error) {
    return (
      <div>
        <div className="webcam-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--accent-red)', padding: 'var(--space-lg)', textAlign: 'center' }}>
          {error}
        </div>
        <div className="webcam-controls">
          <button className="btn btn-secondary btn-sm" onClick={handleCancel}>
            <X size={12} /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="webcam-container">
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className="webcam-controls">
        <button className="btn btn-primary btn-sm" onClick={capture}>
          <Camera size={12} /> Capture
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleCancel}>
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  );
}
