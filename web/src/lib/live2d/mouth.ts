import { writable } from 'svelte/store';

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const mouthOpenStore = writable(0);

export const mouthOpen = {
  subscribe: mouthOpenStore.subscribe
};

export const setMouthOpen = (value: number) => {
  mouthOpenStore.set(clamp01(value));
};

let activeCleanup: (() => void | Promise<void>) | null = null;

export const stopMouthTracking = async () => {
  if (!activeCleanup) {
    mouthOpenStore.set(0);
    return;
  }

  const cleanup = activeCleanup;
  activeCleanup = null;

  try {
    await cleanup();
  } catch (error) {
    console.warn('stopMouthTracking: cleanup failed', error);
  } finally {
    mouthOpenStore.set(0);
  }
};

export const trackMouthFromAudio = async (audio: HTMLMediaElement | null) => {
  await stopMouthTracking();

  if (!audio) return;
  if (typeof window === 'undefined') return;
  if (typeof AudioContext === 'undefined') return;

  const { start, cleanup } = createAudioTracker(audio);
  activeCleanup = cleanup;
  await start();
};

const createAudioTracker = (audio: HTMLMediaElement) => {
  const context = new AudioContext();
  const source = context.createMediaElementSource(audio);
  const analyser = context.createAnalyser();
  const silentGain = context.createGain();

  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.3;

  source.connect(analyser);
  silentGain.gain.value = 0;
  analyser.connect(silentGain);
  silentGain.connect(context.destination);
  source.connect(context.destination);

  const data = new Uint8Array(analyser.fftSize);
  let raf = 0;
  let disposed = false;

  const update = () => {
    if (disposed) return;

    analyser.getByteTimeDomainData(data);

    let sumSquares = 0;
    for (let i = 0; i < data.length; i += 1) {
      const centered = (data[i] - 128) / 128;
      sumSquares += centered * centered;
    }

    const rms = Math.sqrt(sumSquares / data.length);
    const normalized = clamp01((rms - 0.05) / 0.4);

    mouthOpenStore.set(normalized);

    raf = window.requestAnimationFrame(update);
  };

  const handleEnded = () => {
    void stopMouthTracking();
  };

  const handlePause = () => {
    if (audio.ended) return;
    void stopMouthTracking();
  };

  audio.addEventListener('ended', handleEnded);
  audio.addEventListener('pause', handlePause);

  const cleanup = async () => {
    if (disposed) return;
    disposed = true;

    window.cancelAnimationFrame(raf);
    audio.removeEventListener('ended', handleEnded);
    audio.removeEventListener('pause', handlePause);

    try {
      source.disconnect();
    } catch (error) {
      console.warn('trackMouthFromAudio: failed to disconnect source', error);
    }

    try {
      analyser.disconnect();
    } catch (error) {
      console.warn('trackMouthFromAudio: failed to disconnect analyser', error);
    }

    try {
      silentGain.disconnect();
    } catch (error) {
      console.warn('trackMouthFromAudio: failed to disconnect gain node', error);
    }

    try {
      if (context.state !== 'closed') {
        await context.close();
      }
    } catch (error) {
      console.warn('trackMouthFromAudio: failed to close audio context', error);
    }

    mouthOpenStore.set(0);
  };

  const start = async () => {
    try {
      if (context.state === 'suspended') {
        await context.resume();
      }
    } catch (error) {
      console.warn('trackMouthFromAudio: failed to resume audio context', error);
    }

    update();
  };

  return { start, cleanup };
};
