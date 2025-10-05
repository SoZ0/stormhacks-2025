import { writable } from 'svelte/store';

export type Live2DReaction = {
  expression?: string;
  motionId?: string;
  ts?: number;
};

export const live2dReaction = writable<Live2DReaction | null>(null);

export const triggerLive2DReaction = (payload: Live2DReaction) => {
  const ts = Date.now();
  live2dReaction.set({ ...payload, ts });
};

