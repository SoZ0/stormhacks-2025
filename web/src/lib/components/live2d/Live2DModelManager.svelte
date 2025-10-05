<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Live2DPreview, type Live2DPreviewConfig } from '$lib';
  import type { ModelOption } from '$lib/chat/types';
  import {
    DEFAULT_ANCHOR,
    DEFAULT_POSITION,
    DEFAULT_SCALE_MULTIPLIER,
    DEFAULT_TARGET_HEIGHT_RATIO,
    type Live2DModelUpdateInput
  } from '$lib/live2d/types';
  import {
    uploadLive2DModel,
    updateLive2DModel,
    deleteLive2DModel
  } from '$lib/live2d/client';
  import { listElevenLabsVoices, type ElevenLabsVoiceOption } from '$lib/tts/client';

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const toNumber = (value: string | number | null | undefined) => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined;
    }
    if (value == null) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const defaultAnchorX = DEFAULT_ANCHOR.x ?? 0.5;
  const defaultAnchorY = DEFAULT_ANCHOR.y ?? 0.5;
  const defaultPositionX = DEFAULT_POSITION.x ?? 0.5;
  const defaultPositionY = DEFAULT_POSITION.y ?? 0.95;

  const CUSTOM_MODEL_PREFIX = '/models/custom/';
  const isExternalPath = (value: string) => /^https?:\/\//i.test(value) || value.startsWith('//');
  const normalizeSlashes = (value: string) => value.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const stripLeadingSlashes = (value: string) => value.replace(/^\/+/, '');
  const ensureLeadingSlash = (value: string) =>
    value.startsWith('/') || isExternalPath(value) ? value : `/${value}`;
  const getCustomSlug = (model: ModelOption | null | undefined) =>
    model?.storage === 'remote' && model?.id?.startsWith('custom-')
      ? model.id.slice('custom-'.length)
      : null;

  const toRelativeModelPath = (model: ModelOption | null | undefined, rawPath: string | null | undefined) => {
    if (!model || !rawPath) return '';
    const trimmed = rawPath.trim();
    if (!trimmed || isExternalPath(trimmed)) return trimmed;
    if (model.storage === 'local') {
      return stripLeadingSlashes(normalizeSlashes(trimmed));
    }
    const normalized = stripLeadingSlashes(normalizeSlashes(trimmed));
    const slug = getCustomSlug(model);
    if (!slug) return normalized;
    const prefix = `models/custom/${slug}/`;
    return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
  };

  const toAbsoluteModelPath = (
    model: ModelOption | null | undefined,
    rawPath: string | null | undefined
  ) => {
    if (!model) return rawPath ?? undefined;
    if (!rawPath) {
      return model.modelPath ?? model.availableModelFiles?.[0];
    }
    const trimmed = rawPath.trim();
    if (!trimmed) {
      return model.modelPath ?? model.availableModelFiles?.[0];
    }
    if (isExternalPath(trimmed)) return trimmed;

    if (model.storage === 'local') {
      return stripLeadingSlashes(normalizeSlashes(trimmed));
    }

    const slug = getCustomSlug(model);
    const normalized = stripLeadingSlashes(normalizeSlashes(trimmed));

    if (!slug) {
      return ensureLeadingSlash(normalized);
    }

    const match = model.availableModelFiles?.find(
      (file) => toRelativeModelPath(model, file) === normalized
    );
    if (match) {
      const normalizedMatch = stripLeadingSlashes(normalizeSlashes(match));
      return ensureLeadingSlash(normalizedMatch);
    }

    const joined = normalizeSlashes(`${CUSTOM_MODEL_PREFIX}${slug}/${normalized}`);
    return ensureLeadingSlash(stripLeadingSlashes(joined));
  };

  interface EditFormState {
    label: string;
    modelPath: string;
    cubismCorePath: string;
    voiceId: string;
    anchorX: string;
    anchorY: string;
    positionX: string;
    positionY: string;
    scaleMultiplier: string;
    targetHeightRatio: string;
  }

  const stringify = (value: number | undefined, fallback: number) => {
    const numeric = value ?? NaN;
    return (Number.isFinite(numeric) ? numeric : fallback).toString();
  };

  const createEmptyForm = (): EditFormState => ({
    label: '',
    modelPath: '',
    cubismCorePath: '',
    voiceId: '',
    anchorX: defaultAnchorX.toString(),
    anchorY: defaultAnchorY.toString(),
    positionX: defaultPositionX.toString(),
    positionY: defaultPositionY.toString(),
    scaleMultiplier: DEFAULT_SCALE_MULTIPLIER.toString(),
    targetHeightRatio: DEFAULT_TARGET_HEIGHT_RATIO.toString()
  });

  const formFromModel = (model: ModelOption): EditFormState => ({
    label: model.label ?? '',
    modelPath: toRelativeModelPath(model, model.modelPath),
    cubismCorePath: model.cubismCorePath ?? '',
    voiceId: model.voiceId ?? '',
    anchorX: stringify(model.anchor?.x, defaultAnchorX),
    anchorY: stringify(model.anchor?.y, defaultAnchorY),
    positionX: stringify(model.position?.x, defaultPositionX),
    positionY: stringify(model.position?.y, defaultPositionY),
    scaleMultiplier: stringify(model.scaleMultiplier, DEFAULT_SCALE_MULTIPLIER),
    targetHeightRatio: stringify(model.targetHeightRatio, DEFAULT_TARGET_HEIGHT_RATIO)
  });

  export let open = false;
  export let models: ModelOption[] = [];
  export let loading = false;
  export let error: string | null = null;
  export let activeModelId: string | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    select: string;
    created: ModelOption;
    updated: ModelOption;
    deleted: string;
    draftChange: ModelOption | null;
  }>();

  let uploadInput: HTMLInputElement | null = null;
  let isUploading = false;
  let isSaving = false;
  let deletingId: string | null = null;
  let pendingDeleteId: string | null = null;
  let uploadError: string | null = null;
  let listError: string | null = null;
  let editError: string | null = null;
  let editingModel: ModelOption | null = null;
  let displayModels: ModelOption[] = [];
  let editForm: EditFormState = createEmptyForm();
  let previewConfig: Live2DPreviewConfig = {};
  let previewLoading = false;
  let previewExpressions: string[] = [];
  let selectedPreviewExpression = '';
  type Live2DPreviewHandle = { setExpression: (name: string) => void };
  let previewRef: Live2DPreviewHandle | null = null;
  let modelsSignature = '';
  let draftSignature = '';
  let voiceOptions: ElevenLabsVoiceOption[] = [];
  let voiceOptionsLoading = false;
  let voiceOptionsError: string | null = null;
  let voiceOptionsAttempted = false;
  let displayVoiceOptions: ElevenLabsVoiceOption[] = [];

  const createDraftSignature = (model: ModelOption | null | undefined) => {
    if (!model) return '';
    return JSON.stringify({
      id: model.id,
      label: model.label,
      modelPath: model.modelPath,
      cubismCorePath: model.cubismCorePath,
      voiceId: model.voiceId,
      anchor: model.anchor,
      position: model.position,
      scaleMultiplier: model.scaleMultiplier,
      targetHeightRatio: model.targetHeightRatio
    });
  };

  const emitDraftChange = (model: ModelOption | null, force = false) => {
    const nextSignature = createDraftSignature(model);
    if (!force && nextSignature === draftSignature) return;
    draftSignature = nextSignature;
    dispatch('draftChange', model);
  };

  const triggerUpload = () => {
    uploadInput?.click();
  };

  const resetState = () => {
    pendingDeleteId = null;
    uploadError = null;
    listError = null;
    editError = null;
    editingModel = null;
    editForm = createEmptyForm();
    previewConfig = {};
    previewExpressions = [];
    selectedPreviewExpression = '';
    previewRef = null;
    previewLoading = false;
    draftSignature = '';
    voiceOptionsLoading = false;
    voiceOptionsAttempted = false;
    voiceOptionsError = null;
    emitDraftChange(null, true);
  };

  const loadVoiceOptions = async (force = false) => {
    if (voiceOptionsLoading) return;
    if (!force && voiceOptionsAttempted) return;

    voiceOptionsAttempted = true;
    voiceOptionsLoading = true;
    voiceOptionsError = null;

    try {
      voiceOptions = await listElevenLabsVoices();
    } catch (err) {
      voiceOptions = [];
      voiceOptionsError = err instanceof Error ? err.message : 'Unable to load ElevenLabs voices';
    } finally {
      voiceOptionsLoading = false;
    }
  };

  const retryVoiceOptions = async () => {
    if (voiceOptionsLoading) return;
    await loadVoiceOptions(true);
  };

  const closeModal = () => {
    resetState();
    dispatch('close');
  };

  const startEditing = (model: ModelOption) => {
    editingModel = model;
    editForm = formFromModel(model);
    editError = null;
    previewExpressions = [];
    selectedPreviewExpression = '';
    draftSignature = '';
  };

  const handleFileChange = async (event: Event) => {
    const target = event.currentTarget as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (!file) return;
    await uploadFile(file);
    if (target) {
      target.value = '';
    }
  };

  const uploadFile = async (file: File) => {
    isUploading = true;
    uploadError = null;

    try {
      const model = await uploadLive2DModel(file);
      if (!displayModels.some((item) => item.id === model.id)) {
        displayModels = [model, ...displayModels];
      }
      dispatch('created', model);
      startEditing(model);
    } catch (err) {
      uploadError = err instanceof Error ? err.message : 'Unable to upload model';
    } finally {
      isUploading = false;
    }
  };

  const beginDelete = (model: ModelOption) => {
    if (deletingId) return;
    pendingDeleteId = model.id;
    listError = null;
  };

  const cancelDelete = () => {
    pendingDeleteId = null;
  };

  const confirmDelete = async (model: ModelOption) => {
    deletingId = model.id;
    listError = null;

    try {
      await deleteLive2DModel(model.id);
      displayModels = displayModels.filter((item) => item.id !== model.id);
      dispatch('deleted', model.id);
      if (editingModel?.id === model.id) {
        editingModel = null;
        editForm = createEmptyForm();
      }
    } catch (err) {
      listError = err instanceof Error ? err.message : 'Unable to delete model';
    } finally {
      deletingId = null;
      pendingDeleteId = null;
    }
  };

  const buildPayload = (): Live2DModelUpdateInput | null => {
    if (!editingModel) return null;

    const label = editForm.label.trim();
    if (!label) {
      editError = 'Model name is required.';
      return null;
    }

    const selectedPath = editingModel.isCustom
      ? toRelativeModelPath(editingModel, editForm.modelPath || editingModel.modelPath)
      : (editForm.modelPath?.trim() || editingModel.modelPath);
    const anchorX = clamp(toNumber(editForm.anchorX) ?? defaultAnchorX, 0, 1);
    const anchorY = clamp(toNumber(editForm.anchorY) ?? defaultAnchorY, 0, 1);
    const positionX = clamp(toNumber(editForm.positionX) ?? defaultPositionX, 0, 1);
    const positionY = clamp(toNumber(editForm.positionY) ?? defaultPositionY, 0, 1);
    const scaleMultiplier = Math.max(toNumber(editForm.scaleMultiplier) ?? DEFAULT_SCALE_MULTIPLIER, 0.01);
    const targetHeightRatio = clamp(
      toNumber(editForm.targetHeightRatio) ?? DEFAULT_TARGET_HEIGHT_RATIO,
      0.1,
      2
    );
    const trimmedVoiceId = editForm.voiceId?.trim() ?? '';

    const payload: Live2DModelUpdateInput = {
      label,
      cubismCorePath: editForm.cubismCorePath.trim() || undefined,
      anchor: { x: anchorX, y: anchorY },
      position: { x: positionX, y: positionY },
      scaleMultiplier,
      targetHeightRatio,
      voiceId: trimmedVoiceId.length > 0 ? trimmedVoiceId : null
    };

    if (selectedPath?.trim()) {
      payload.modelPath = selectedPath.trim();
    }

    return payload;
  };

  const saveChanges = async () => {
    if (!editingModel) return;
    const payload = buildPayload();
    if (!payload) return;

    isSaving = true;
    editError = null;

    try {
      const updated = await updateLive2DModel(editingModel.id, payload, editingModel);
      displayModels = displayModels.map((item) => (item.id === updated.id ? updated : item));
      dispatch('updated', updated);
      startEditing(updated);
    } catch (err) {
      editError = err instanceof Error ? err.message : 'Unable to update model';
    } finally {
      isSaving = false;
    }
  };

  const selectActive = (model: ModelOption) => {
    dispatch('select', model.id);
  };

  const handlePreviewExpressionChange = (event: Event) => {
    const value = (event.currentTarget as HTMLSelectElement | null)?.value ?? '';
    selectedPreviewExpression = value;
    if (value && previewRef) {
      previewRef.setExpression(value);
    }
  };

  const resolvedNumber = (
    value: string | number | null | undefined,
    fallback: number,
    min?: number,
    max?: number
  ) => {
    const parsed = toNumber(value);
    let result = Number.isFinite(parsed ?? NaN) ? (parsed as number) : fallback;
    if (typeof min === 'number' && typeof max === 'number') {
      result = clamp(result, min, max);
    }
    return result;
  };

  const resolvedModelPath = () => {
    if (!editingModel) return undefined;
    const absolute = toAbsoluteModelPath(editingModel, editForm.modelPath);
    if (absolute) return absolute;
    return editingModel.availableModelFiles?.[0];
  };

  $: if (editingModel) {
    const modelPath = resolvedModelPath();
    const anchorX = resolvedNumber(editForm.anchorX, defaultAnchorX, 0, 1);
    const anchorY = resolvedNumber(editForm.anchorY, defaultAnchorY, 0, 1);
    const positionX = resolvedNumber(editForm.positionX, defaultPositionX, 0, 1);
    const positionY = resolvedNumber(editForm.positionY, defaultPositionY, 0, 1);
    const scaleMultiplierValue = Math.max(
      resolvedNumber(editForm.scaleMultiplier, DEFAULT_SCALE_MULTIPLIER),
      0.01
    );
    const targetHeightRatioValue = resolvedNumber(
      editForm.targetHeightRatio,
      DEFAULT_TARGET_HEIGHT_RATIO,
      0.1,
      2
    );
    const absolutePath = modelPath ?? editingModel.modelPath ?? editingModel.availableModelFiles?.[0];
    const previewModelPath = absolutePath?.trim() || undefined;
    const manualCubismPath = editForm.cubismCorePath.trim();
    const modelCubismPath = editingModel.cubismCorePath?.trim();
    const cubismCore = manualCubismPath || modelCubismPath || undefined;
    const trimmedVoiceId = editForm.voiceId?.trim() ?? '';
    const nextDraft: ModelOption = {
      ...editingModel,
      label: editForm.label.trim() || editingModel.label,
      modelPath: previewModelPath ?? editingModel.modelPath,
      cubismCorePath: cubismCore,
      voiceId: trimmedVoiceId.length > 0 ? trimmedVoiceId : null,
      anchor: { x: anchorX, y: anchorY },
      position: { x: positionX, y: positionY },
      scaleMultiplier: scaleMultiplierValue,
      targetHeightRatio: targetHeightRatioValue
    };

    previewConfig = {
      modelPath: previewModelPath,
      cubismCorePath: cubismCore,
      anchor: { x: anchorX, y: anchorY },
      position: { x: positionX, y: positionY },
      scaleMultiplier: scaleMultiplierValue,
      targetHeightRatio: targetHeightRatioValue,
      storage: editingModel.storage,
      localModelId: editingModel.storage === 'local' ? editingModel.id : null
    };

    emitDraftChange(nextDraft);
  } else {
    previewConfig = {};
    previewExpressions = [];
    emitDraftChange(null);
  }

  $: if (!previewExpressions.length) {
    selectedPreviewExpression = '';
  } else if (!selectedPreviewExpression || !previewExpressions.includes(selectedPreviewExpression)) {
    selectedPreviewExpression = previewExpressions[0];
  }

  $: if (selectedPreviewExpression && previewRef) {
    previewRef.setExpression(selectedPreviewExpression);
  }

  $: if (!open) {
    isUploading = false;
    isSaving = false;
    deletingId = null;
    resetState();
  }

  $: if (open) {
    loadVoiceOptions();
  }

  $: {
    const trimmedVoiceId = editForm.voiceId?.trim() ?? '';
    if (trimmedVoiceId && !voiceOptions.some((item) => item.id === trimmedVoiceId)) {
      displayVoiceOptions = [...voiceOptions, { id: trimmedVoiceId, name: `${trimmedVoiceId} (missing)` }];
    } else {
      displayVoiceOptions = [...voiceOptions];
    }
  }

  const modelBadge = (model: ModelOption) => (model.isCustom ? 'Custom' : 'Built-in');
  const displayPath = (path: string) => path.replace(/^\//, '');

  const createSignature = (items: ModelOption[] | null | undefined) => {
    if (!items?.length) return '';
    return items.map((item) => item.id ?? item.modelPath ?? '').join('|');
  };

  $: {
    const incomingSignature = createSignature(models);

    if (incomingSignature !== modelsSignature) {
      displayModels = models ? [...models] : [];
      modelsSignature = incomingSignature;
    }
  }
</script>

{#if open}
  <div class="fixed inset-0 z-[70] flex items-center justify-center bg-surface-950/80 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Manage Live2D models">
    <button
      type="button"
      class="absolute inset-0 h-full w-full cursor-default bg-transparent"
      on:click={closeModal}
      aria-label="Dismiss Live2D model manager"
    ></button>
    <div class="relative z-10 mx-auto w-5/6">
      <div class="flex h-full flex-col rounded-3xl border border-surface-800/50 bg-surface-950/95 shadow-2xl shadow-surface-950/40">
        <header class="flex items-start justify-between gap-4 border-b border-surface-800/60 px-6 py-5">
          <div class="flex flex-col gap-1">
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-surface-400">Live2D Models</p>
            <h2 class="text-xl font-semibold text-surface-50">Manage Models</h2>
            <p class="text-sm text-surface-400">Upload new avatars, adjust positioning, and keep your collection organised.</p>
          </div>
          <button
            type="button"
            class="btn btn-icon btn-icon-base border border-surface-800/60 bg-surface-950/80 text-lg text-surface-200 transition hover:text-surface-50"
            on:click={closeModal}
            aria-label="Close Live2D model manager"
          >
            ✕
          </button>
        </header>
        <div class="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section class="flex flex-col gap-5">
            <div class="rounded-2xl border border-surface-800/50 bg-surface-950/70 p-5">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex-1">
                  <h3 class="text-sm font-semibold text-surface-100">Upload custom model</h3>
                  <p class="text-xs text-surface-400">Select a zipped Live2D project. Supported archives must include a <code>.model3.json</code> file.</p>
                </div>
                <button
                  type="button"
                  class="btn btn-base bg-primary-500 text-[color:var(--color-primary-contrast-500)] font-semibold"
                  on:click={triggerUpload}
                  disabled={isUploading}
                >
                  {#if isUploading}
                    Uploading…
                  {:else}
                    Choose ZIP
                  {/if}
                </button>
              </div>
              <input
                type="file"
                accept=".zip"
                class="hidden"
                bind:this={uploadInput}
                on:change={handleFileChange}
              />
              {#if uploadError}
                <p class="mt-3 rounded-xl border border-error-500/40 bg-error-500/20 px-3 py-2 text-xs text-error-100">
                  {uploadError}
                </p>
              {/if}
              {#if isUploading}
                <div class="mt-4 flex items-center gap-2 text-xs text-surface-300">
                  <span class="h-3 w-3 animate-spin rounded-full border border-surface-500/40 border-t-transparent"></span>
                  Uploading model…
                </div>
              {/if}
            </div>

            {#if error}
              <p class="rounded-2xl border border-error-500/40 bg-error-500/15 px-4 py-3 text-xs text-error-100">
                {error}
              </p>
            {/if}
            {#if listError}
              <p class="rounded-2xl border border-error-500/40 bg-error-500/15 px-4 py-3 text-xs text-error-100">
                {listError}
              </p>
            {/if}

            <div class="rounded-2xl border border-surface-800/50 bg-surface-950/70">
              <header class="flex items-center justify-between gap-3 border-b border-surface-800/60 px-5 py-4">
                <h3 class="text-sm font-semibold text-surface-100">Available models</h3>
                {#if loading}
                  <span class="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-surface-400">
                    <span class="h-2 w-2 animate-pulse rounded-full bg-primary-300"></span>
                    Loading…
                  </span>
                {/if}
              </header>
              <div class="max-h-[340px] space-y-3 overflow-y-auto px-5 py-4">
                {#if !loading && displayModels.length === 0}
                  <div class="rounded-2xl border border-dashed border-surface-800/60 bg-surface-950/60 p-6 text-center text-sm text-surface-400">
                    Upload a Live2D zip to get started.
                  </div>
                {:else}
                  {#each displayModels as model, index (model.id ?? model.modelPath ?? index)}
                    <div
                      class={`flex flex-col gap-3 rounded-2xl border px-4 py-4 transition ${
                        model.id === activeModelId
                          ? 'border-primary-500/60 bg-primary-500/10'
                          : 'border-surface-800/60 bg-surface-950/60 hover:border-surface-700/70'
                      }`}
                    >
                      <div class="flex flex-col gap-2">
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <p class="truncate text-sm font-semibold text-surface-50" title={model.label}>
                              {model.label}
                            </p>
                            <p class="truncate text-xs text-surface-400" title={model.modelPath}>
                              {displayPath(model.modelPath)}
                            </p>
                          </div>
                          <span class={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            model.isCustom ? 'bg-primary-500/15 text-primary-200' : 'bg-surface-800/70 text-surface-300'
                          }`}
                            >{modelBadge(model)}</span
                          >
                        </div>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <button
                          type="button"
                          class="btn btn-xs border border-primary-500/50 bg-primary-500/10 text-xs font-semibold text-primary-100 hover:bg-primary-500/20"
                          on:click={() => selectActive(model)}
                        >
                          Set Active
                        </button>
                        {#if model.editable}
                          <button
                            type="button"
                            class="btn btn-xs border border-surface-700/60 bg-surface-900/70 text-xs font-semibold text-surface-200 hover:border-surface-600/70"
                            on:click={() => startEditing(model)}
                          >
                            Edit
                          </button>
                        {/if}
                        {#if model.removable}
                          {#if pendingDeleteId === model.id}
                            <button
                              type="button"
                              class="btn btn-xs border border-error-500/50 bg-error-500/20 text-xs font-semibold text-error-100"
                              on:click={() => confirmDelete(model)}
                              disabled={deletingId === model.id}
                            >
                              {#if deletingId === model.id}
                                Removing…
                              {:else}
                                Confirm Delete
                              {/if}
                            </button>
                            <button
                              type="button"
                              class="btn btn-xs border border-surface-700/60 bg-surface-900/70 text-xs font-semibold text-surface-200"
                              on:click={cancelDelete}
                              disabled={deletingId === model.id}
                            >
                              Cancel
                            </button>
                          {:else}
                            <button
                              type="button"
                              class="btn btn-xs border border-error-500/40 bg-error-500/10 text-xs font-semibold text-error-100 hover:border-error-500/60"
                              on:click={() => beginDelete(model)}
                              disabled={deletingId === model.id}
                            >
                              Delete
                            </button>
                          {/if}
                        {/if}
                      </div>
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          </section>

          <section class="flex flex-col rounded-2xl border border-surface-800/50 bg-surface-950/70 p-5">
            {#if editingModel}
              <div class="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 class="text-sm font-semibold text-surface-100">Configure {editingModel.label}</h3>
                  <p class="text-xs text-surface-400">Adjust how the model is positioned inside the preview canvas.</p>
                </div>
          
              </div>
              <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                <form class="flex flex-col gap-4" on:submit|preventDefault={saveChanges}>
                <label class="flex flex-col gap-2 text-sm text-surface-200">
                  <span class="text-xs font-semibold uppercase tracking-[0.2em] text-surface-400">Display name</span>
                  <input
                    class="rounded-xl border border-surface-700/60 bg-surface-900/70 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                    bind:value={editForm.label}
                    placeholder="Model name"
                    required
                  />
                </label>

                {#if editingModel.availableModelFiles.length > 1}
                  <label class="flex flex-col gap-2 text-sm text-surface-200">
                    <span class="text-xs font-semibold uppercase tracking-[0.2em] text-surface-400">Model file</span>
                    <select
                      class="rounded-xl border border-surface-700/60 bg-surface-900/70 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                      bind:value={editForm.modelPath}
                    >
                      {#each editingModel.availableModelFiles as file}
                        <option value={toRelativeModelPath(editingModel, file)}>{displayPath(file)}</option>
                      {/each}
                    </select>
                  </label>
                {/if}

                <label class="flex flex-col gap-2 text-sm text-surface-200">
                  <span class="text-xs font-semibold uppercase tracking-[0.2em] text-surface-400">Cubism core script</span>
                  <input
                    class="rounded-xl border border-surface-700/60 bg-surface-900/70 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                    bind:value={editForm.cubismCorePath}
                    placeholder="/vendor/live2d/live2dcubismcore.min.js"
                  />
                </label>

                <label class="flex flex-col gap-2 text-sm text-surface-200">
                  <span class="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-surface-400">
                    <span>ElevenLabs voice</span>
                    <button
                      type="button"
                      class="rounded-lg border border-surface-700/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-surface-300 transition hover:border-surface-600/70 hover:text-surface-100 disabled:opacity-50"
                      on:click={() => loadVoiceOptions(true)}
                      disabled={voiceOptionsLoading}
                    >
                      Refresh
                    </button>
                  </span>
                  {#if voiceOptionsLoading}
                    <div class="flex items-center gap-2 rounded-xl border border-surface-700/60 bg-surface-900/70 px-3 py-2 text-xs text-surface-300">
                      <span class="h-3 w-3 animate-spin rounded-full border border-surface-500/40 border-t-transparent"></span>
                      Loading voices…
                    </div>
                  {:else}
                    <div class="flex flex-col gap-2">
                      <select
                        class="rounded-xl border border-surface-700/60 bg-surface-900/70 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none disabled:opacity-60"
                        bind:value={editForm.voiceId}
                        disabled={voiceOptionsLoading}
                      >
                        <option value="">Default voice</option>
                        {#each displayVoiceOptions as voice}
                          <option value={voice.id}>{voice.name}</option>
                        {/each}
                      </select>
                      <div class="text-[10px] uppercase tracking-[0.15em] text-surface-500">Or enter voice ID</div>
                      <input
                        class="rounded-xl border border-surface-700/60 bg-surface-900/70 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                        bind:value={editForm.voiceId}
                        placeholder="elevenlabs-voice-id"
                        spellcheck={false}
                      />
                    </div>
                  {/if}
                  {#if voiceOptionsError}
                    <div class="flex items-center gap-2 text-xs text-error-200">
                      <span class="truncate">{voiceOptionsError}</span>
                      <button
                        type="button"
                        class="rounded-lg border border-error-500/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-error-100 hover:border-error-500/60 disabled:opacity-50"
                        on:click={retryVoiceOptions}
                        disabled={voiceOptionsLoading}
                      >
                        Retry
                      </button>
                    </div>
                  {/if}
                </label>

                <div class="grid gap-3 md:grid-cols-2">
                  <label class="flex flex-col gap-2 text-sm text-surface-200">
                    <span class="text-xs font-semibold uppercase tracking-[0.2em] text-surface-400">Anchor X</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      class="rounded-xl border border-surface-700/60 bg-surface-900/70 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                      bind:value={editForm.anchorX}
                    />
                  </label>
                  <label class="flex flex-col gap-2 text-sm text-surface-200">
                    <span class="text-xs font-semibold uppercase tracking-[0.2em] text-surface-400">Anchor Y</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      class="rounded-xl border border-surface-700/60 bg-surface-900/70 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                      bind:value={editForm.anchorY}
                    />
                  </label>
                  <label class="flex flex-col gap-2 text-sm text-surface-200">
                    <span class="text-xs font-semibold uppercase tracking-[0.2em] text-surface-400">Position X</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      class="rounded-xl border border-surface-700/60 bg-surface-900/70 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                      bind:value={editForm.positionX}
                    />
                  </label>
                  <label class="flex flex-col gap-2 text-sm text-surface-200">
                    <span class="text-xs font-semibold uppercase tracking-[0.2em] text-surface-400">Position Y</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      class="rounded-xl border border-surface-700/60 bg-surface-900/70 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                      bind:value={editForm.positionY}
                    />
                  </label>
                </div>

                <div class="grid gap-3 md:grid-cols-2">
                  <label class="flex flex-col gap-2 text-sm text-surface-200">
                    <span class="text-xs font-semibold uppercase tracking-[0.2em] text-surface-400">Scale multiplier</span>
                    <input
                      type="number"
                      min="0.1"
                      max="5"
                      step="0.05"
                      class="rounded-xl border border-surface-700/60 bg-surface-900/70 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                      bind:value={editForm.scaleMultiplier}
                    />
                  </label>
                  <label class="flex flex-col gap-2 text-sm text-surface-200">
                    <span class="text-xs font-semibold uppercase tracking-[0.2em] text-surface-400">Target height ratio</span>
                    <input
                      type="number"
                      min="0.1"
                      max="2"
                      step="0.05"
                      class="rounded-xl border border-surface-700/60 bg-surface-900/70 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                      bind:value={editForm.targetHeightRatio}
                    />
                  </label>
                </div>

                <!-- Idle autoplay removed: animations will be triggered by LLM tool calls -->

                {#if editError}
                  <p class="rounded-2xl border border-error-500/40 bg-error-500/15 px-4 py-3 text-xs text-error-100">
                    {editError}
                  </p>
                {/if}

                <div class="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    class="btn btn-base bg-primary-500 text-[color:var(--color-primary-contrast-500)] font-semibold"
                    disabled={isSaving}
                  >
                    {#if isSaving}
                      Saving…
                    {:else}
                      Save Changes
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="btn btn-base border border-surface-700/60 bg-surface-900/70 text-sm font-semibold text-surface-200"
                    on:click={() => editingModel && startEditing(editingModel)}
                    disabled={isSaving}
                  >
                    Reset
                  </button>
                </div>
              </form>
              <div class="relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-surface-800/60 bg-surface-900/50 lg:mx-0 lg:max-w-[640px]">
                <div class="aspect-[16/9] w-full h-full">
                  <Live2DPreview
                    config={previewConfig}
                    bind:loading={previewLoading}
                    bind:expressions={previewExpressions}
                    bind:this={previewRef}
                  />
                </div>
                {#if previewLoading}
                  <div class="absolute inset-0 flex items-center justify-center bg-surface-950/70 backdrop-blur-sm">
                    <div class="h-10 w-10 animate-spin rounded-full border-2 border-primary-400/80 border-t-transparent"></div>
                  </div>
                {/if}
                {#if previewExpressions.length}
                  <div class="absolute left-4 top-4 flex flex-col gap-1 rounded-2xl border border-surface-800/50 bg-surface-950/80 px-3 py-2 text-[11px] text-surface-200 shadow-lg shadow-surface-950/40">
                    <span class="font-semibold uppercase tracking-[0.2em] text-surface-400">Expression</span>
                    <select
                      class="w-44 rounded-xl border border-surface-700/60 bg-surface-950/80 px-3 py-2 text-xs font-semibold text-surface-100 focus:border-primary-500 focus:outline-none"
                      bind:value={selectedPreviewExpression}
                      on:change={handlePreviewExpressionChange}
                    >
                      {#each previewExpressions as expr}
                        <option value={expr}>{expr}</option>
                      {/each}
                    </select>
                  </div>
                {/if}
              </div>
            </div>
            {:else}
              <div class="flex flex-1 items-center justify-center rounded-xl border border-dashed border-surface-800/60 bg-surface-950/60 p-6 text-center text-sm text-surface-400">
                Select a custom model from the list or upload a new archive to begin editing.
              </div>
            {/if}
          </section>
        </div>
      </div>
    </div>
  </div>
{/if}
