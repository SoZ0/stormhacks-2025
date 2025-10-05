export interface ModelOption {
  label: string;
  modelPath: string;
  cubismCorePath?: string;
  anchor?: { x?: number; y?: number };
  position?: { x?: number; y?: number };
  scaleMultiplier?: number;
  targetHeightRatio?: number;
}
