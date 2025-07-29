// 🎤 Audio Service - Handles ESP32 and Laptop Microphone Integration
class AudioService {
  constructor() {
    this.ws = null;
    this.mediaRecorder = null;
    this.audioStream = null;
    this.isRecording = false;
    this.esp32Connected = false;
    this.primaryDevice = 'laptop';
    this.onTranscriptCallback = null;
    this.onConnectionStatusCallback = null;
    this.onRecordingStatusCallback = null;
    
    // WebSocket connection to local Whisper server
    this.connectToWhisperServer();
    
    // Check microphone status on init
    this.checkMicrophoneStatus();
  }

  // Connect to the integrated Whisper WebSocket server
  connectToWhisperServer() {
    try {
      // Connect to the WebSocket server
      let wsUrl;
      if (process.env.NODE_ENV === 'development') {
        wsUrl = 'ws://localhost:8080';
      } else {
        // For production, use the same host but with WebSocket protocol
        const host = window.location.hostname;
        const port = window.location.port || '443';
        wsUrl = `wss://${host}:8080`; // Note: you might need to adjust this for your production setup
      }
      
      console.log('🔌 Connecting to Whisper WebSocket:', wsUrl);
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('✅ Connected to Whisper WebSocket server');
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📥 Received from Whisper server:', data);
          
          if (data.action === 'transcript' && this.onTranscriptCallback) {
            this.onTranscriptCallback(data.text, data.device, data.duration);
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };
      
      this.ws.onclose = () => {
        console.log('❌ Whisper WebSocket disconnected. Attempting to reconnect...');
        setTimeout(() => this.connectToWhisperServer(), 3000);
      };
      
      this.ws.onerror = (error) => {
        console.error('❌ Whisper WebSocket error:', error);
      };
      
    } catch (error) {
      console.error('❌ Failed to connect to Whisper WebSocket:', error);
    }
  }

  // Check microphone status from server
  async checkMicrophoneStatus() {
    try {
      // Use the same API base as the main app
      const API_BASE = process.env.NODE_ENV === 'development' 
        ? 'http://localhost:10000' 
        : 'https://sasi-toolkit.onrender.com';
      
      const response = await fetch(`${API_BASE}/microphone-status`);
      const status = await response.json();
      
      this.esp32Connected = status.esp32Connected;
      this.primaryDevice = status.primaryDevice;
      
      console.log('🎤 Microphone status:', status);
      
      if (this.onConnectionStatusCallback) {
        this.onConnectionStatusCallback(status);
      }
      
      return status;
    } catch (error) {
      console.error('❌ Failed to check microphone status:', error);
      return { esp32Connected: false, primaryDevice: 'laptop' };
    }
  }

  // Start recording with automatic device selection
  async startRecording() {
    if (this.isRecording) {
      console.log('⚠️ Already recording');
      return;
    }

    console.log('🎤 Starting recording...');
    this.isRecording = true;
    
    if (this.onRecordingStatusCallback) {
      this.onRecordingStatusCallback(true, this.primaryDevice);
    }

    // Update microphone status
    await this.checkMicrophoneStatus();
    
    if (this.esp32Connected) {
      console.log('🎤 Using ESP32 microphone (primary)');
      // ESP32 will handle recording automatically when button is pressed
      // Just send start message to WebSocket
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          action: 'start_recording',
          device: 'ESP32'
        }));
      }
    } else {
      console.log('🎤 Using laptop microphone (fallback)');
      await this.startLaptopRecording();
    }
  }

  // Start recording from laptop microphone
  async startLaptopRecording() {
    try {
      // Request microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      console.log('🎤 Laptop microphone access granted');

      // Create MediaRecorder for audio capture
      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      const audioChunks = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        console.log('🎤 Laptop recording stopped, processing audio...');
        
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioData = Array.from(new Uint8Array(arrayBuffer));
        
        // Send audio data to WebSocket server
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            action: 'laptop_audio_chunk',
            audioData: audioData
          }));
          
          // Signal end of recording
          this.ws.send(JSON.stringify({
            action: 'stop_recording',
            device: 'laptop'
          }));
        }
      };

      // Start recording
      this.mediaRecorder.start();
      console.log('🎤 Laptop recording started');
      
      // Send start message to server
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          action: 'start_recording',
          device: 'laptop'
        }));
      }

    } catch (error) {
      console.error('❌ Failed to start laptop recording:', error);
      this.isRecording = false;
      
      if (this.onRecordingStatusCallback) {
        this.onRecordingStatusCallback(false, 'error');
      }
      
      // Fallback to browser speech recognition
      alert('Microphone access denied. Falling back to browser speech recognition.');
    }
  }

  // Stop recording
  async stopRecording() {
    if (!this.isRecording) {
      console.log('⚠️ Not currently recording');
      return;
    }

    console.log('⏹️ Stopping recording...');
    this.isRecording = false;
    
    if (this.onRecordingStatusCallback) {
      this.onRecordingStatusCallback(false, this.primaryDevice);
    }

    if (this.esp32Connected) {
      // ESP32 will handle stopping automatically
      // Just send stop message to WebSocket
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          action: 'stop_recording',
          device: 'ESP32'
        }));
      }
    } else {
      // Stop laptop recording
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
      
      if (this.audioStream) {
        this.audioStream.getTracks().forEach(track => track.stop());
        this.audioStream = null;
      }
    }
  }

  // Set callback for transcript results
  onTranscript(callback) {
    this.onTranscriptCallback = callback;
  }

  // Set callback for connection status changes
  onConnectionStatus(callback) {
    this.onConnectionStatusCallback = callback;
  }

  // Set callback for recording status changes
  onRecordingStatus(callback) {
    this.onRecordingStatusCallback = callback;
  }

  // Get current device info
  getCurrentDevice() {
    return {
      primaryDevice: this.primaryDevice,
      esp32Connected: this.esp32Connected,
      isRecording: this.isRecording
    };
  }

  // Clean up resources
  cleanup() {
    if (this.ws) {
      this.ws.close();
    }
    
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
    }
  }
}

export default AudioService;
