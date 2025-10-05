import { openDB, type IDBPDatabase } from 'idb';
import { unzip } from 'fflate';
import {
  DEFAULT_ANCHOR,
  DEFAULT_CUBISM_CORE_PATH,
  DEFAULT_POSITION,
  DEFAULT_SCALE_MULTIPLIER,
  DEFAULT_TARGET_HEIGHT_RATIO,
  type Live2DModelConfig,
  type Live2DModelDefinition,
  type Live2DModelUpdateInput,
  type Live2DVectorConfig
} from './types';

interface StoredCustomModel {
  id: string;
  label: string;
  zipData: ArrayBuffer;
  modelPath: string;
  availableModelFiles: string[];
  settings: Live2DModelConfig;
  createdAt: number;
  updatedAt: number;
  originalFilename?: string;
}

interface ModelListItem {
  id: string;
  label: string;
  modelPath: string;
  availableModelFiles: string[];
  settings: Live2DModelConfig;
  createdAt: number;
  updatedAt: number;
}

interface CreateLocalModelInput {
  file: File;
  label?: string;
}

interface UpdateLocalModelInput extends Live2DModelConfig {
  label?: string;
  modelPath?: string;
}

const DB_NAME = 'live2d-custom-models';
const DB_VERSION = 2;
const STORE_NAME = 'models';
const OVERRIDE_STORE = 'overrides';

const isBrowser = typeof window !== 'undefined';

const sanitizePath = (value: string) => {
  const cleaned = value
    .replace(/\\/g, '/')
    .replace(/\r?\n/g, '')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/');

  const segments = cleaned.split('/');
  const stack: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length) stack.pop();
      continue;
    }
    if (segment.startsWith('__MACOSX')) continue;
    stack.push(segment);
  }

  return stack.join('/');
};

const isExternalPath = (value: string) =>
  /^([a-z]+:)?\/\//i.test(value) || value.startsWith('blob:') || value.startsWith('data:');

const resolveRelativePath = (base: string, relative: string) => {
  if (isExternalPath(relative)) return relative;

  const baseDir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  return sanitizePath(`${baseDir}${relative}`);
};

const defaultSettings = (): Live2DModelConfig => ({
  cubismCorePath: DEFAULT_CUBISM_CORE_PATH,
  anchor: { ...DEFAULT_ANCHOR },
  position: { ...DEFAULT_POSITION },
  scaleMultiplier: DEFAULT_SCALE_MULTIPLIER,
  targetHeightRatio: DEFAULT_TARGET_HEIGHT_RATIO,
  voiceId: null
});

interface StoredModelOverride {
  id: string;
  label?: string;
  modelPath?: string;
  cubismCorePath?: string;
  anchor?: Live2DVectorConfig;
  position?: Live2DVectorConfig;
  scaleMultiplier?: number;
  targetHeightRatio?: number;
  voiceId?: string | null;
  updatedAt: number;
}

const ensureDb = async (): Promise<IDBPDatabase> => {
  if (!isBrowser) {
    throw new Error('Custom Live2D models require a browser environment.');
  }

  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1 && !db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains(OVERRIDE_STORE)) {
        db.createObjectStore(OVERRIDE_STORE, { keyPath: 'id' });
      }
    }
  });
};

const unzipEntries = (buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> =>
  new Promise((resolve, reject) => {
    unzip(new Uint8Array(buffer), (error, data) => {
      if (error || !data) {
        reject(error ?? new Error('Failed to unzip model archive.'));
        return;
      }

      const map = new Map<string, Uint8Array>();
      for (const [rawKey, value] of Object.entries(data)) {
        const normalized = sanitizePath(rawKey);
        if (!normalized || normalized.endsWith('/')) continue;
        if (normalized.startsWith('__MACOSX')) continue;
        map.set(normalized, value);
      }

      resolve(map);
    });
  });

const extractModelFiles = async (buffer: ArrayBuffer) => {
  const entries = await unzipEntries(buffer);
  const modelFiles: string[] = [];

  for (const key of entries.keys()) {
    if (key.toLowerCase().endsWith('.model3.json')) {
      modelFiles.push(key);
    }
  }

  if (!modelFiles.length) {
    throw new Error('The uploaded archive does not include a .model3.json file.');
  }

  return { entries, modelFiles } as const;
};

const deriveLabel = (inputLabel: string | undefined, file: File, modelFiles: string[]) => {
  if (inputLabel?.trim()) return inputLabel.trim();
  if (file.name?.trim()) {
    const base = file.name.replace(/\.zip$/i, '');
    if (base) return base;
  }
  const first = modelFiles[0];
  const segments = first.split('/');
  const candidate = segments[segments.length - 1]?.replace(/\.model3\.json$/i, '');
  return candidate || 'Custom Live2D Model';
};

const randomId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const storedToDefinition = (record: ModelListItem): Live2DModelDefinition => ({
  id: record.id,
  label: record.label,
  modelPath: record.modelPath,
  availableModelFiles: [...record.availableModelFiles],
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  isCustom: true,
  editable: true,
  removable: true,
  storage: 'local',
  cubismCorePath: record.settings.cubismCorePath,
  anchor: record.settings.anchor,
  position: record.settings.position,
  scaleMultiplier: record.settings.scaleMultiplier,
  targetHeightRatio: record.settings.targetHeightRatio,
  voiceId: record.settings.voiceId ?? null
});

export const listLocalModels = async (): Promise<Live2DModelDefinition[]> => {
  const db = await ensureDb();
  const records = await db.getAll(STORE_NAME);
  return records.map((record: StoredCustomModel) =>
    storedToDefinition({
      id: record.id,
      label: record.label,
      modelPath: record.modelPath,
      availableModelFiles: record.availableModelFiles,
      settings: record.settings,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    })
  );
};

export const createLocalModel = async (
  input: CreateLocalModelInput
): Promise<Live2DModelDefinition> => {
  const { file, label } = input;
  const buffer = await file.arrayBuffer();
  const { modelFiles } = await extractModelFiles(buffer);
  const modelPath = modelFiles[0];

  const record: StoredCustomModel = {
    id: `custom-${randomId()}`,
    label: deriveLabel(label, file, modelFiles),
    zipData: buffer,
    modelPath,
    availableModelFiles: modelFiles,
    settings: defaultSettings(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    originalFilename: file.name
  };

  const db = await ensureDb();
  await db.put(STORE_NAME, record);

  return storedToDefinition({
    id: record.id,
    label: record.label,
    modelPath: record.modelPath,
    availableModelFiles: record.availableModelFiles,
    settings: record.settings,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  });
};

export const updateLocalModel = async (
  id: string,
  updates: UpdateLocalModelInput
): Promise<Live2DModelDefinition> => {
  const db = await ensureDb();
  const record = (await db.get(STORE_NAME, id)) as StoredCustomModel | undefined;
  if (!record) {
    throw new Error('Custom model not found.');
  }

  const nextSettings: Live2DModelConfig = {
    cubismCorePath: updates.cubismCorePath ?? record.settings.cubismCorePath,
    anchor: updates.anchor ?? record.settings.anchor,
    position: updates.position ?? record.settings.position,
    scaleMultiplier: updates.scaleMultiplier ?? record.settings.scaleMultiplier,
    targetHeightRatio: updates.targetHeightRatio ?? record.settings.targetHeightRatio,
    voiceId: updates.voiceId ?? record.settings.voiceId ?? null
  };

  const nextRecord: StoredCustomModel = {
    ...record,
    label: updates.label?.trim() ? updates.label.trim() : record.label,
    modelPath: updates.modelPath?.trim() ? sanitizePath(updates.modelPath) : record.modelPath,
    settings: nextSettings,
    updatedAt: Date.now()
  };

  await db.put(STORE_NAME, nextRecord);

  return storedToDefinition({
    id: nextRecord.id,
    label: nextRecord.label,
    modelPath: nextRecord.modelPath,
    availableModelFiles: nextRecord.availableModelFiles,
    settings: nextRecord.settings,
    createdAt: nextRecord.createdAt,
    updatedAt: nextRecord.updatedAt
  });
};

export const deleteLocalModel = async (id: string): Promise<void> => {
  const db = await ensureDb();
  await db.delete(STORE_NAME, id);
};

export const getLocalModel = async (id: string): Promise<StoredCustomModel | undefined> => {
  const db = await ensureDb();
  return (await db.get(STORE_NAME, id)) as StoredCustomModel | undefined;
};

export const listModelOverrides = async (): Promise<Map<string, StoredModelOverride>> => {
  const db = await ensureDb();
  const records = (await db.getAll(OVERRIDE_STORE)) as StoredModelOverride[];
  const map = new Map<string, StoredModelOverride>();
  for (const record of records) {
    map.set(record.id, record);
  }
  return map;
};

export const getModelOverride = async (id: string): Promise<StoredModelOverride | undefined> => {
  const db = await ensureDb();
  return (await db.get(OVERRIDE_STORE, id)) as StoredModelOverride | undefined;
};

const mergeVector = (base: Live2DVectorConfig | undefined, override: Live2DVectorConfig | undefined) => {
  return {
    x: typeof override?.x === 'number' ? override.x : base?.x,
    y: typeof override?.y === 'number' ? override.y : base?.y
  } satisfies Live2DVectorConfig;
};

export const applyModelOverride = (
  model: Live2DModelDefinition,
  override: StoredModelOverride | undefined
): Live2DModelDefinition => {
  if (!override) return model;

  return {
    ...model,
    label: override.label ?? model.label,
    modelPath: override.modelPath ?? model.modelPath,
    cubismCorePath: override.cubismCorePath ?? model.cubismCorePath,
    anchor: mergeVector(model.anchor, override.anchor),
    position: mergeVector(model.position, override.position),
    scaleMultiplier: override.scaleMultiplier ?? model.scaleMultiplier,
    targetHeightRatio: override.targetHeightRatio ?? model.targetHeightRatio,
    voiceId:
      override.voiceId === undefined
        ? model.voiceId ?? null
        : override.voiceId,
    updatedAt: Math.max(model.updatedAt, override.updatedAt ?? model.updatedAt)
  };
};

const extractOverrideFromModel = (model: Live2DModelDefinition): StoredModelOverride => ({
  id: model.id,
  label: model.label,
  modelPath: model.modelPath,
  cubismCorePath: model.cubismCorePath,
  anchor: model.anchor,
  position: model.position,
  scaleMultiplier: model.scaleMultiplier,
  targetHeightRatio: model.targetHeightRatio,
  voiceId: model.voiceId ?? null,
  updatedAt: model.updatedAt
});

const mergeModelAndUpdate = (
  base: Live2DModelDefinition,
  payload: Live2DModelUpdateInput
): Live2DModelDefinition => ({
  ...base,
  label: payload.label?.trim() ? payload.label.trim() : base.label,
  modelPath: payload.modelPath?.trim() ? payload.modelPath.trim() : base.modelPath,
  cubismCorePath: payload.cubismCorePath?.trim()
    ? payload.cubismCorePath.trim()
    : base.cubismCorePath,
  anchor: mergeVector(base.anchor, payload.anchor),
  position: mergeVector(base.position, payload.position),
  scaleMultiplier:
    typeof payload.scaleMultiplier === 'number' && Number.isFinite(payload.scaleMultiplier)
      ? payload.scaleMultiplier
      : base.scaleMultiplier,
  targetHeightRatio:
    typeof payload.targetHeightRatio === 'number' && Number.isFinite(payload.targetHeightRatio)
      ? payload.targetHeightRatio
      : base.targetHeightRatio,
  voiceId:
    payload.voiceId === undefined
      ? base.voiceId ?? null
      : (payload.voiceId === null ? null : payload.voiceId),
  updatedAt: Date.now()
});

export const saveModelOverride = async (
  base: Live2DModelDefinition,
  payload: Live2DModelUpdateInput
): Promise<Live2DModelDefinition> => {
  const next = mergeModelAndUpdate(base, payload);
  const record = extractOverrideFromModel(next);
  const db = await ensureDb();
  await db.put(OVERRIDE_STORE, record);
  return next;
};

export const deleteModelOverride = async (id: string): Promise<void> => {
  const db = await ensureDb();
  await db.delete(OVERRIDE_STORE, id);
};

const guessMimeType = (path: string) => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.moc3')) return 'application/octet-stream';
  if (lower.endsWith('.motion3.json')) return 'application/json';
  if (lower.endsWith('.exp3.json')) return 'application/json';
  if (lower.endsWith('.physics3.json')) return 'application/json';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
};

const createBlobUrlFactory = () => {
  const urls = new Map<string, string>();

  const ensure = (path: string, data: Uint8Array) => {
    if (urls.has(path)) {
      return urls.get(path) as string;
    }

    const blob = new Blob([data], { type: guessMimeType(path) });
    const url = URL.createObjectURL(blob);
    urls.set(path, url);
    return url;
  };

  const cleanup = () => {
    for (const url of urls.values()) {
      URL.revokeObjectURL(url);
    }
    urls.clear();
  };

  return { ensure, cleanup } as const;
};

const rewritePathsDeep = (
  value: unknown,
  resolve: (path: string) => string | undefined
): unknown => {
  if (typeof value === 'string') {
    const resolved = resolve(value);
    return resolved ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewritePathsDeep(item, resolve));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const next: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      next[key] = rewritePathsDeep(val, resolve);
    }
    return next;
  }

  return value;
};

export interface LocalModelAssetBundle {
  modelUrl: string;
  dispose: () => void;
}

export const buildLocalModelBundle = async (
  id: string,
  requestedModelPath?: string
): Promise<LocalModelAssetBundle> => {
  const record = await getLocalModel(id);
  if (!record) {
    throw new Error('Custom model assets are missing.');
  }

  const normalizedModelPath = sanitizePath(requestedModelPath || record.modelPath);
  const { entries } = await extractModelFiles(record.zipData);
  const modelData = entries.get(normalizedModelPath);

  if (!modelData) {
    throw new Error('Selected model file is missing from storage.');
  }

  const { ensure, cleanup } = createBlobUrlFactory();

  const baseResolver = (target: string) => {
    const absolute = sanitizePath(resolveRelativePath(normalizedModelPath, target));
    const data = entries.get(absolute);
    if (!data) return undefined;
    return ensure(absolute, data);
  };

  const decoder = new TextDecoder();
  const json = JSON.parse(decoder.decode(modelData));
  const rewritten = rewritePathsDeep(json, baseResolver);

  const modelBlob = new Blob([JSON.stringify(rewritten)], { type: 'application/json' });
  const modelUrl = URL.createObjectURL(modelBlob);

  const dispose = () => {
    cleanup();
    URL.revokeObjectURL(modelUrl);
  };

  return { modelUrl, dispose };
};

export const hasBrowserStorage = () => isBrowser;
