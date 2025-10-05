import type { Live2DModelDefinition } from '$lib/live2d/types';

export type ModelOption = Live2DModelDefinition;

export type ThinkingMode = 'auto' | 'expanded' | 'collapsed' | 'hidden';

export interface ThinkingModeOption {
  value: ThinkingMode;
  label: string;
  description?: string;
}

export const THINKING_MODE_VALUES: readonly ThinkingMode[] = [
  'auto',
  'expanded',
  'collapsed',
  'hidden'
] as const;

export const isThinkingMode = (value: unknown): value is ThinkingMode =>
  typeof value === 'string' && THINKING_MODE_VALUES.includes(value as ThinkingMode);
