// public/js/voice.js
const Voice = {
  recognition: null,
  isRecording: false,
  transcript: '',
  onResult: null,
  onStateChange: null,

  init() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('Speech recognition not supported');
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        this.transcript += finalTranscript;
      }

      if (this.onResult) {
        this.onResult(this.transcript, interimTranscript);
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please enable microphone permissions.');
      }
      this.stop();
    };

    this.recognition.onend = () => {
      if (this.isRecording) {
        // Restart if still supposed to be recording
        this.recognition.start();
      }
    };

    return true;
  },

  start() {
    if (!this.recognition) {
      if (!this.init()) {
        alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
        return;
      }
    }

    this.transcript = '';
    this.isRecording = true;
    this.recognition.start();

    if (this.onStateChange) {
      this.onStateChange(true);
    }
  },

  stop() {
    this.isRecording = false;
    if (this.recognition) {
      this.recognition.stop();
    }

    if (this.onStateChange) {
      this.onStateChange(false);
    }

    return this.transcript;
  },

  toggle() {
    if (this.isRecording) {
      return this.stop();
    } else {
      this.start();
      return '';
    }
  }
};
