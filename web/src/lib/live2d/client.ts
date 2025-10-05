import type {
  Live2DModelDefinition,
  Live2DModelListResponse,
  Live2DModelResponse,
  Live2DModelUpdateInput
} from './types';

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

export const listLive2DModels = async (): Promise<Live2DModelDefinition[]> => {
  const response = await fetch('/api/live2d/models', { method: 'GET' });
  const data = ensureOk(
    response,
    await jsonOrNull<Live2DModelListResponse>(response),
    'Unable to load Live2D models'
  );
  return Array.isArray(data.models) ? data.models : [];
};

interface UploadModelOptions {
  label?: string;
}

export const uploadLive2DModel = async (
  file: File,
  options: UploadModelOptions = {}
): Promise<Live2DModelDefinition> => {
  const formData = new FormData();
  formData.set('file', file);
  if (options.label) {
    formData.set('label', options.label);
  }

  const response = await fetch('/api/live2d/models', {
    method: 'POST',
    body: formData
  });

  const data = ensureOk(
    response,
    await jsonOrNull<Live2DModelResponse>(response),
    'Unable to upload Live2D model'
  );

  if (!data.model) {
    throw new Error('Upload succeeded but no model was returned.');
  }

  return data.model;
};

export const updateLive2DModel = async (
  id: string,
  payload: Live2DModelUpdateInput
): Promise<Live2DModelDefinition> => {
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

  return data.model;
};

export const deleteLive2DModel = async (id: string): Promise<void> => {
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
  const response = await fetch(`/api/live2d/models/${id}`, { method: 'GET' });
  const data = ensureOk(
    response,
    await jsonOrNull<Live2DModelResponse>(response),
    'Unable to load Live2D model'
  );
  if (!data.model) {
    throw new Error('Model not found');
  }
  return data.model;
};
