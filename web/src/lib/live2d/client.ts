import type {
  Live2DModelDefinition,
  Live2DModelListResponse,
  Live2DModelResponse,
  Live2DModelUpdateInput
} from './types';
import {
  applyModelOverride,
  buildLocalModelBundle,
  createLocalModel,
  deleteLocalModel,
  deleteModelOverride,
  getLocalModel,
  getModelOverride,
  hasBrowserStorage,
  listLocalModels,
  listModelOverrides,
  saveModelOverride,
  updateLocalModel
} from './local-store';

const jsonOrNull = async <T>(response: Response) => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const ensureOk = <T extends { error?: string }>(
  response: Response,
  data: T | null,
  defaultMessage: string
) => {
  if (!response.ok || !data) {
    const message = data?.error ?? `${defaultMessage} (${response.status})`;
    throw new Error(message);
  }
  return data;
};

const normalizeRemoteModel = (model: Live2DModelDefinition): Live2DModelDefinition => ({
  ...model,
  storage: model.storage ?? (model.isCustom ? 'remote' : 'builtin'),
  editable: model.storage === 'builtin' ? true : model.editable,
  removable: model.storage === 'builtin' ? false : model.removable
});

export const listLive2DModels = async (): Promise<Live2DModelDefinition[]> => {
  const local = hasBrowserStorage() ? await listLocalModels() : [];
  const overrides = hasBrowserStorage() ? await listModelOverrides() : new Map();

  try {
    const response = await fetch('/api/live2d/models', { method: 'GET' });
    const data = ensureOk(
      response,
      await jsonOrNull<Live2DModelListResponse>(response),
      'Unable to load Live2D models'
    );
    const remote = Array.isArray(data.models)
      ? data.models.map((item) => {
          const normalized = normalizeRemoteModel(item);
          const override = overrides.get(normalized.id);
          return applyModelOverride(normalized, override);
        })
      : [];
    return [...local, ...remote];
  } catch (error) {
    console.warn('Failed to load server models, falling back to local only.', error);
    const fallback = hasBrowserStorage()
      ? local.map((item) => applyModelOverride(item, overrides.get(item.id)))
      : local;
    return [...fallback];
  }
};

interface UploadModelOptions {
  label?: string;
}

export const uploadLive2DModel = async (
  file: File,
  options: UploadModelOptions = {}
): Promise<Live2DModelDefinition> => {
  if (!hasBrowserStorage()) {
    throw new Error('Custom models require a browser environment.');
  }

  return createLocalModel({ file, label: options.label });
};

export const updateLive2DModel = async (
  id: string,
  payload: Live2DModelUpdateInput,
  currentModel?: Live2DModelDefinition
): Promise<Live2DModelDefinition> => {
  if (hasBrowserStorage()) {
    const existing = await getLocalModel(id);
    if (existing) {
      return updateLocalModel(id, payload);
    }
  }

  if (currentModel?.storage === 'builtin' && hasBrowserStorage()) {
    return saveModelOverride(currentModel, payload);
  }

  const response = await fetch(`/api/live2d/models/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = ensureOk(
    response,
    await jsonOrNull<Live2DModelResponse>(response),
    'Unable to update Live2D model'
  );

  if (!data.model) {
    throw new Error('Update succeeded but no model was returned.');
  }

  return normalizeRemoteModel(data.model);
};

export const deleteLive2DModel = async (id: string): Promise<void> => {
  if (hasBrowserStorage()) {
    const existing = await getLocalModel(id);
    if (existing) {
      await deleteLocalModel(id);
      await deleteModelOverride(id);
      return;
    }
  }

  const response = await fetch(`/api/live2d/models/${id}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const data = await jsonOrNull<{ error?: string }>(response);
    const message = data?.error ?? `Unable to delete Live2D model (${response.status})`;
    throw new Error(message);
  }
};

export const getLive2DModel = async (id: string): Promise<Live2DModelDefinition> => {
  if (hasBrowserStorage()) {
    const local = await getLocalModel(id);
    if (local) {
      return {
        id: local.id,
        label: local.label,
        modelPath: local.modelPath,
        availableModelFiles: [...local.availableModelFiles],
        createdAt: local.createdAt,
        updatedAt: local.updatedAt,
        isCustom: true,
        editable: true,
        removable: true,
        storage: 'local',
        cubismCorePath: local.settings.cubismCorePath,
        anchor: local.settings.anchor,
        position: local.settings.position,
        scaleMultiplier: local.settings.scaleMultiplier,
        targetHeightRatio: local.settings.targetHeightRatio,
        voiceId: local.settings.voiceId ?? null
      } satisfies Live2DModelDefinition;
    }
  }

  const response = await fetch(`/api/live2d/models/${id}`, { method: 'GET' });
  const data = ensureOk(
    response,
    await jsonOrNull<Live2DModelResponse>(response),
    'Unable to load Live2D model'
  );
  if (!data.model) {
    throw new Error('Model not found');
  }
  const normalized = normalizeRemoteModel(data.model);
  if (hasBrowserStorage()) {
    const override = await getModelOverride(id);
    return applyModelOverride(normalized, override);
  }
  return normalized;
};

export const getLocalModelBundle = buildLocalModelBundle;
