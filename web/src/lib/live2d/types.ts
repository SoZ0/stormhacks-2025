export interface Live2DVectorConfig {
  x?: number;
  y?: number;
}

export interface Live2DModelConfig {
  cubismCorePath?: string;
  anchor?: Live2DVectorConfig;
  position?: Live2DVectorConfig;
  scaleMultiplier?: number;
  targetHeightRatio?: number;
}

export interface Live2DModelDefinition extends Live2DModelConfig {
  id: string;
  label: string;
  modelPath: string;
  availableModelFiles: string[];
  createdAt: number;
  updatedAt: number;
  isCustom: boolean;
  editable: boolean;
  removable: boolean;
}

export interface Live2DModelListResponse {
  models: Live2DModelDefinition[];
  error?: string;
}

export interface Live2DModelResponse {
  model: Live2DModelDefinition;
  error?: string;
}

export interface Live2DModelUpdateInput extends Live2DModelConfig {
  label?: string;
  modelPath?: string;
}

export const DEFAULT_CUBISM_CORE_PATH = '/vendor/live2d/live2dcubismcore.min.js';
export const DEFAULT_ANCHOR: Live2DVectorConfig = { x: 0.5, y: 0.5 };
export const DEFAULT_POSITION: Live2DVectorConfig = { x: 0.5, y: 0.95 };
export const DEFAULT_SCALE_MULTIPLIER = 1;
export const DEFAULT_TARGET_HEIGHT_RATIO = 0.9;
