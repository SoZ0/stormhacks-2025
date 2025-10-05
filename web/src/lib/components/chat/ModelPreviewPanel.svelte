<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Live2DPreview } from '$lib';
  import type { ModelOption } from '$lib/chat/types';

  export let models: ModelOption[] = [];
  export let currentModel: ModelOption;
  export let previewIndex = 0;

  const dispatch = createEventDispatcher<{ prev: void; next: void; confirm: number }>();

  const handlePrev = () => dispatch('prev');
  const handleNext = () => dispatch('next');
  const handleConfirm = () => dispatch('confirm', previewIndex);
</script>

<div class="model-preview">
  <Live2DPreview
    modelPath={currentModel.modelPath}
    cubismCorePath={currentModel.cubismCorePath}
    scaleMultiplier={currentModel.scaleMultiplier ?? 1}
    targetHeightRatio={currentModel.targetHeightRatio ?? 0.9}
    anchorX={currentModel.anchor?.x ?? 0.5}
    anchorY={currentModel.anchor?.y ?? 0.5}
    positionX={currentModel.position?.x ?? 0.5}
    positionY={currentModel.position?.y ?? 0.95}
  />

  <div class="model-selector">
    <button type="button" class="arrow-btn" on:click={handlePrev}>⟨</button>
    <button type="button" class="confirm-btn" on:click={handleConfirm}>
      {models[previewIndex]?.label ?? 'Select' }
    </button>
    <button type="button" class="arrow-btn" on:click={handleNext}>⟩</button>
  </div>
</div>

<style>
  .model-preview {
    position: relative;
    height: 100%;
  }

  .model-selector {
    position: absolute;
    bottom: 5%;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(34, 34, 34, 0.8);
    padding: 8px 16px;
    border-radius: 12px;
    backdrop-filter: blur(6px);
  }

  .arrow-btn {
    background: transparent;
    color: #fff;
    font-size: 1.5rem;
    border: none;
    cursor: pointer;
  }

  .confirm-btn {
    background: #10a37f;
    color: white;
    font-weight: 600;
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .confirm-btn:hover {
    background: #0d8c6c;
  }
</style>
