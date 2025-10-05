import { createModel, type KaldiRecognizer, type Model } from 'vosk-browser';

const DEFAULT_MODEL_URL = import.meta.env.VITE_VOSK_MODEL_PATH ??
  '/models/vosk-model-small-en-us-0.15.tar.gz';

export type OfflineSpeechErrorCode =
  | 'model-unavailable'
  | 'audio-permission-denied'
  | 'audio-error'
  | 'recognizer-error';

export class OfflineSpeechError extends Error {
  code: OfflineSpeechErrorCode;

  constructor(code: OfflineSpeechErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'OfflineSpeechError';
  }
}

export const isOfflineSpeechSupported = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return Boolean(window.AudioContext ?? (window as { webkitAudioContext?: AudioContext }).webkitAudioContext) &&
    Boolean(navigator.mediaDevices?.getUserMedia);
};

type SpeechCallbacks = {
  onStart?: () => void;
  onStop?: () => void;
  onPartial?: (text: string) => void;
  onResult?: (text: string) => void;
  onError?: (error: OfflineSpeechError) => void;
};

type ControllerOptions = {
  modelUrl?: string;
  sampleRate?: number;
  bufferSize?: number;
  logLevel?: number;
};

const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_BUFFER_SIZE = 4096;

let cachedModelPromise: Promise<Model> | null = null;

const loadModel = async (modelUrl: string, logLevel: number): Promise<Model> => {
  if (!isOfflineSpeechSupported()) {
    throw new OfflineSpeechError(
      'audio-error',
      'This browser does not support the APIs required for offline speech recognition.'
    );
  }

  if (!cachedModelPromise) {
    cachedModelPromise = createModel(modelUrl, logLevel).catch((error: unknown) => {
      cachedModelPromise = null;
      const message = error instanceof Error ? error.message : String(error);
      throw new OfflineSpeechError(
        'model-unavailable',
        `Unable to load offline speech model from ${modelUrl}. ${message}. Ensure the archive exists and is readable.`
      );
    });
  }

  return cachedModelPromise;
};

const getAudioContextCtor = (): typeof AudioContext => {
  if (typeof window === 'undefined') {
    throw new OfflineSpeechError('audio-error', 'AudioContext is not available in this environment.');
  }

  const ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ctor) {
    throw new OfflineSpeechError('audio-error', 'AudioContext is not available in this browser.');
  }

  return ctor;
};

export class OfflineSpeechController {
  private readonly callbacks: SpeechCallbacks;
  private readonly modelUrl: string;
  private readonly sampleRate: number;
  private readonly bufferSize: number;
  private readonly logLevel: number;
  private model: Model | null = null;
  private recognizer: KaldiRecognizer | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private running = false;
  private initializing: Promise<void> | null = null;
  private partialHandler: EventListener | null = null;
  private resultHandler: EventListener | null = null;

  private get recognizerMessageHandlers(): [EventListener | null, EventListener | null] {
    return [this.partialHandler, this.resultHandler];
  }

  constructor(callbacks: SpeechCallbacks = {}, options: ControllerOptions = {}) {
    this.callbacks = callbacks;
    this.modelUrl = options.modelUrl ?? DEFAULT_MODEL_URL;
    this.sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.bufferSize = options.bufferSize ?? DEFAULT_BUFFER_SIZE;
    this.logLevel = options.logLevel ?? -2;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = this.setup();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async setup(): Promise<void> {
    try {
      this.model = await loadModel(this.modelUrl, this.logLevel);
    } catch (error) {
      const speechError = error instanceof OfflineSpeechError
        ? error
        : new OfflineSpeechError('model-unavailable', (error as Error)?.message ?? 'Unknown model error');
      this.callbacks.onError?.(speechError);
      throw speechError;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: this.sampleRate,
        },
        video: false,
      });
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Microphone permission was denied.'
        : (error as Error)?.message ?? 'Unable to access the microphone.';
      const speechError = new OfflineSpeechError('audio-permission-denied', message);
      this.callbacks.onError?.(speechError);
      throw speechError;
    }

    try {
      const AudioContextCtor = getAudioContextCtor();
      this.audioContext = new AudioContextCtor({ sampleRate: this.sampleRate });
      await this.audioContext.resume();

      this.processorNode = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);
      this.processorNode.onaudioprocess = (event) => {
        if (!this.recognizer) {
          return;
        }
        try {
          const channelData = event.inputBuffer.getChannelData(0);
          const floatCopy = new Float32Array(channelData.length);
          floatCopy.set(channelData);
          this.recognizer.acceptWaveformFloat(floatCopy, event.inputBuffer.sampleRate);
        } catch (acceptError) {
          const message = acceptError instanceof Error ? acceptError.message : 'Unknown recognizer error';
          this.callbacks.onError?.(new OfflineSpeechError('recognizer-error', message));
        }
      };

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.recognizer = new this.model.KaldiRecognizer(this.sampleRate);
      this.recognizer.setWords(false);

      this.partialHandler = ((event: Event & {
        detail?: { result?: { partial?: string } };
      }) => {
        const text = event.detail?.result?.partial ?? '';
        if (text) {
          this.callbacks.onPartial?.(text);
        }
      }) as EventListener;

      this.resultHandler = ((event: Event & {
        detail?: { result?: { text?: string } };
      }) => {
        const text = event.detail?.result?.text?.trim() ?? '';
        if (text) {
          this.callbacks.onResult?.(text);
        }
      }) as EventListener;

      this.recognizer.addEventListener('partialresult', this.partialHandler);
      this.recognizer.addEventListener('result', this.resultHandler);

      this.running = true;
      this.callbacks.onStart?.();
    } catch (error) {
      await this.stop();
      const speechError = error instanceof OfflineSpeechError
        ? error
        : new OfflineSpeechError('audio-error', (error as Error)?.message ?? 'Failed to initialize offline speech.');
      this.callbacks.onError?.(speechError);
      throw speechError;
    }
  }

  async stop(): Promise<void> {
    const wasRunning = this.running;

    if (!wasRunning && !this.initializing) {
      return;
    }

    this.running = false;

    if (this.recognizer) {
      const [partialHandler, resultHandler] = this.recognizerMessageHandlers;
      if (partialHandler) {
        this.recognizer.removeEventListener('partialresult', partialHandler);
      }
      if (resultHandler) {
        this.recognizer.removeEventListener('result', resultHandler);
      }
      this.partialHandler = null;
      this.resultHandler = null;

      try {
        this.recognizer.retrieveFinalResult();
      } catch {
        // Swallow errors when retrieving the final result during cleanup.
      }
      this.recognizer.remove();
      this.recognizer = null;
    }

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    if (wasRunning) {
      this.callbacks.onStop?.();
    }
  }

  async destroy(): Promise<void> {
    await this.stop();
    if (this.model) {
      this.model.terminate();
      this.model = null;
      cachedModelPromise = null;
    }
  }
}

export const createOfflineSpeechController = (
  callbacks: SpeechCallbacks = {},
  options: ControllerOptions = {}
): OfflineSpeechController => new OfflineSpeechController(callbacks, options);

export const getDefaultModelPath = (): string => DEFAULT_MODEL_URL;
