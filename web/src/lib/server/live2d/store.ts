import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import AdmZip from 'adm-zip';

export interface Live2DVectorConfig {
  x?: number;
  y?: number;
}

export interface Live2DModelSettings {
  cubismCorePath?: string;
  anchor?: Live2DVectorConfig;
  position?: Live2DVectorConfig;
  scaleMultiplier?: number;
  targetHeightRatio?: number;
  voiceId?: string | null;
}

export interface Live2DModelRecord extends Live2DModelSettings {
  id: string;
  label: string;
  modelPath: string;
  availableModelFiles: string[];
  createdAt: number;
  updatedAt: number;
  isCustom: boolean;
  editable: boolean;
  removable: boolean;
  storage: 'builtin' | 'remote';
}

interface StoredLive2DModel extends Live2DModelSettings {
  id: string;
  label: string;
  slug: string;
  modelPath: string; // relative to the custom model root
  availableModelFiles: string[]; // relative paths
  createdAt: number;
  updatedAt: number;
}

interface CreateModelInput {
  label?: string;
  filename?: string;
  zipBuffer: Buffer;
}

export interface UpdateModelInput extends Live2DModelSettings {
  label?: string;
  modelPath?: string;
}

const PROJECT_ROOT = process.cwd();
const STATIC_ROOT = path.join(PROJECT_ROOT, 'static');
const CUSTOM_MODELS_ROOT = path.join(STATIC_ROOT, 'models', 'custom');
const DATA_ROOT = path.join(PROJECT_ROOT, '.data');
const DATA_FILE = path.join(DATA_ROOT, 'live2d-models.json');
const DEFAULT_CUBISM_CORE_PATH = '/vendor/live2d/live2dcubismcore.min.js';
const DEFAULT_ANCHOR: Live2DVectorConfig = { x: 0.5, y: 0.5 };
const DEFAULT_POSITION: Live2DVectorConfig = { x: 0.5, y: 0.95 };
const DEFAULT_SCALE_MULTIPLIER = 1;
const DEFAULT_TARGET_HEIGHT_RATIO = 0.9;

const BUILTIN_MODELS: Live2DModelRecord[] = [
  {
    id: 'builtin-hiyori',
    label: 'Hiyori',
    modelPath: '/models/hiyori/runtime/hiyori_pro_t11.model3.json',
    availableModelFiles: ['/models/hiyori/runtime/hiyori_pro_t11.model3.json'],
    cubismCorePath: DEFAULT_CUBISM_CORE_PATH,
    anchor: { x: 0.49, y: 0.39 },
    position: { x: 0.5, y: 1 },
    scaleMultiplier: 3.3,
    targetHeightRatio: DEFAULT_TARGET_HEIGHT_RATIO,
    voiceId: null,
    createdAt: 0,
    updatedAt: 0,
    isCustom: false,
    editable: true,
    removable: false,
    storage: 'builtin'
  },
  {
    id: 'builtin-miku',
    label: 'Miku',
    modelPath: '/models/miku/runtime/miku_sample_t04.model3.json',
    availableModelFiles: ['/models/miku/runtime/miku_sample_t04.model3.json'],
    cubismCorePath: DEFAULT_CUBISM_CORE_PATH,
    anchor: { x: 0.5, y: 0.2 },
    position: { x: 0.5, y: 0.48 },
    scaleMultiplier: 2.55,
    targetHeightRatio: DEFAULT_TARGET_HEIGHT_RATIO,
    voiceId: null,
    createdAt: 0,
    updatedAt: 0,
    isCustom: false,
    editable: true,
    removable: false,
    storage: 'builtin'
  },
  {
    id: 'builtin-huohuo',
    label: 'HuoHuo',
    modelPath: '/models/huohuo/huohuo.model3.json',
    availableModelFiles: ['/models/huohuo/huohuo.model3.json'],
    cubismCorePath: DEFAULT_CUBISM_CORE_PATH,
    anchor: { x: 0.5, y: 0.31 },
    position: { x: 0.84, y: 1 },
    scaleMultiplier: 4,
    targetHeightRatio: DEFAULT_TARGET_HEIGHT_RATIO,
    voiceId: null,
    createdAt: 0,
    updatedAt: 0,
    isCustom: false,
    editable: true,
    removable: false,
    storage: 'builtin'
  }
];

const READ_ONLY_ERROR_CODES = new Set(['EROFS', 'EACCES', 'EPERM', 'ENOTSUP']);

const isReadOnlyFsError = (error: unknown): error is NodeJS.ErrnoException => {
  if (!error || typeof error !== 'object') return false;
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' && READ_ONLY_ERROR_CODES.has(code);
};

let storageIsReadOnly = false;

const ensureDirectory = async (directory: string) => {
  if (storageIsReadOnly) return;
  try {
    await mkdir(directory, { recursive: true });
  } catch (error) {
    if (isReadOnlyFsError(error)) {
      storageIsReadOnly = true;
      return;
    }
    throw error;
  }
};

const ensureDirectories = async () => {
  await ensureDirectory(CUSTOM_MODELS_ROOT);
  await ensureDirectory(DATA_ROOT);
};

interface WriteDataFileOptions {
  allowReadOnly?: boolean;
}

const writeDataFile = async (
  models: StoredLive2DModel[],
  options: WriteDataFileOptions = {}
) => {
  const { allowReadOnly = false } = options;

  await ensureDirectories();
  if (storageIsReadOnly) {
    if (allowReadOnly) return;
    throw new Error('Live2D model storage is read-only in this environment.');
  }

  try {
    await writeFile(DATA_FILE, JSON.stringify(models, null, 2), 'utf8');
  } catch (error) {
    if (isReadOnlyFsError(error)) {
      storageIsReadOnly = true;
      if (allowReadOnly) return;
      throw new Error('Live2D model storage is read-only in this environment.');
    }
    throw error;
  }
};

const readDataFile = async (): Promise<StoredLive2DModel[]> => {
  await ensureDirectories();
  if (!existsSync(DATA_FILE)) {
    if (storageIsReadOnly) {
      return [];
    }
    try {
      await writeDataFile([], { allowReadOnly: true });
    } catch {
      return [];
    }
    return [];
  }

  const raw = await readFile(DATA_FILE, 'utf8');
  if (!raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is StoredLive2DModel => Boolean(entry?.id && entry?.modelPath));
  } catch {
    return [];
  }
};

const toPosix = (value: string) => value.split(path.sep).join('/');

const slugify = (value: string, fallback: string) => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-{2,}/g, '-');
  return slug.length > 0 ? slug : fallback;
};

const uniqueSlug = async (candidate: string) => {
  const models = await readDataFile();
  const existing = new Set(models.map((model) => model.slug));
  if (!existing.has(candidate)) return candidate;
  let suffix = 2;
  let next = `${candidate}-${suffix}`;
  while (existing.has(next)) {
    suffix += 1;
    next = `${candidate}-${suffix}`;
  }
  return next;
};

const sanitizeRelativePath = (value: string) => toPosix(path.normalize(value)).replace(/^\/+/, '');

const collectModelFiles = async (
  directory: string,
  parent = ''
): Promise<string[]> => {
  const entries: Dirent[] = await readdir(directory, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === '__MACOSX') continue;
    const entryPath = path.join(directory, entry.name);
    const relative = parent ? path.join(parent, entry.name) : entry.name;

    if (entry.isDirectory()) {
      const nested = await collectModelFiles(entryPath, relative);
      results.push(...nested);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.model3.json')) {
      results.push(sanitizeRelativePath(relative));
    }
  }

  return results;
};

const extractZip = async (buffer: Buffer, destination: string) => {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  for (const entry of entries) {
    const originalName = entry.entryName.replace(/\\/g, '/');
    if (!originalName) continue;
    if (originalName.startsWith('__MACOSX')) continue;

    const normalized = sanitizeRelativePath(originalName);
    const targetPath = path.join(destination, normalized);
    if (!targetPath.startsWith(destination)) {
      continue;
    }

    if (entry.isDirectory) {
      await mkdir(targetPath, { recursive: true });
    } else {
      await mkdir(path.dirname(targetPath), { recursive: true });
      const data = entry.getData();
      await writeFile(targetPath, data);
    }
  }
};

const resolveModelPath = (slug: string, relative: string) =>
  `/models/custom/${slug}/${sanitizeRelativePath(relative)}`;

const normalizeSettings = (input: Live2DModelSettings | undefined): Live2DModelSettings => ({
  cubismCorePath: input?.cubismCorePath || DEFAULT_CUBISM_CORE_PATH,
  anchor: {
    x: input?.anchor?.x,
    y: input?.anchor?.y
  },
  position: {
    x: input?.position?.x,
    y: input?.position?.y
  },
  scaleMultiplier:
    typeof input?.scaleMultiplier === 'number' && Number.isFinite(input.scaleMultiplier)
      ? input.scaleMultiplier
      : DEFAULT_SCALE_MULTIPLIER,
  targetHeightRatio:
    typeof input?.targetHeightRatio === 'number' && Number.isFinite(input.targetHeightRatio)
      ? input.targetHeightRatio
      : DEFAULT_TARGET_HEIGHT_RATIO,
  voiceId:
    typeof input?.voiceId === 'string' && input.voiceId.trim().length > 0
      ? input.voiceId.trim()
      : null
});

const mapStoredToRecord = (stored: StoredLive2DModel): Live2DModelRecord => {
  const basePath = resolveModelPath(stored.slug, stored.modelPath);
  const files = stored.availableModelFiles.map((file) => resolveModelPath(stored.slug, file));
  const settings = normalizeSettings(stored);
  return {
    id: stored.id,
    label: stored.label,
    modelPath: basePath,
    availableModelFiles: files,
    cubismCorePath: settings.cubismCorePath,
    anchor: settings.anchor,
    position: settings.position,
    scaleMultiplier: settings.scaleMultiplier,
    targetHeightRatio: settings.targetHeightRatio,
    voiceId: settings.voiceId ?? null,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    isCustom: true,
    editable: true,
    removable: true,
    storage: 'remote'
  };
};

export const listModels = async (): Promise<Live2DModelRecord[]> => {
  const stored = await readDataFile();
  return [...BUILTIN_MODELS, ...stored.map((entry) => mapStoredToRecord(entry))];
};

export const getModelById = async (id: string): Promise<Live2DModelRecord | undefined> => {
  const models = await listModels();
  return models.find((model) => model.id === id);
};

export const createModel = async (input: CreateModelInput): Promise<Live2DModelRecord> => {
  const { zipBuffer, filename, label } = input;
  if (!zipBuffer?.length) {
    throw new Error('Zip file is required.');
  }

  await ensureDirectories();
  if (storageIsReadOnly) {
    throw new Error('Live2D model storage is read-only in this environment.');
  }

  const baseName = label?.trim() || filename?.replace(/\.zip$/i, '') || 'live2d-model';
  const slugBase = slugify(baseName, 'live2d-model');
  const slug = await uniqueSlug(slugBase);
  const modelId = `custom-${slug}`;
  const targetDir = path.join(CUSTOM_MODELS_ROOT, slug);

  if (existsSync(targetDir)) {
    await rm(targetDir, { recursive: true, force: true });
  }
  await mkdir(targetDir, { recursive: true });

  await extractZip(zipBuffer, targetDir);

  const modelFiles = await collectModelFiles(targetDir);
  if (modelFiles.length === 0) {
    await rm(targetDir, { recursive: true, force: true });
    throw new Error('The uploaded zip does not contain any ".model3.json" files.');
  }

  const now = Date.now();
  const stored: StoredLive2DModel = {
    id: modelId,
    label: baseName.trim() || 'Live2D Model',
    slug,
    modelPath: modelFiles[0],
    availableModelFiles: modelFiles,
    createdAt: now,
    updatedAt: now,
    cubismCorePath: DEFAULT_CUBISM_CORE_PATH,
    anchor: DEFAULT_ANCHOR,
    position: DEFAULT_POSITION,
    scaleMultiplier: DEFAULT_SCALE_MULTIPLIER,
    targetHeightRatio: DEFAULT_TARGET_HEIGHT_RATIO,
    voiceId: null
  };

  const existing = await readDataFile();
  await writeDataFile([...existing, stored]);

  return mapStoredToRecord(stored);
};

export const updateModel = async (id: string, input: UpdateModelInput): Promise<Live2DModelRecord> => {
  const existing = await readDataFile();
  const index = existing.findIndex((model) => model.id === id);
  if (index === -1) {
    throw new Error('Model not found.');
  }

  const current = existing[index];
  const updates: Partial<StoredLive2DModel> = {};

  if (typeof input.label === 'string' && input.label.trim()) {
    updates.label = input.label.trim();
  }

  if (typeof input.cubismCorePath === 'string' && input.cubismCorePath.trim()) {
    updates.cubismCorePath = input.cubismCorePath.trim();
  }

  if (input.anchor) {
    updates.anchor = {
      x:
        typeof input.anchor.x === 'number' && Number.isFinite(input.anchor.x)
          ? input.anchor.x
          : current.anchor?.x,
      y:
        typeof input.anchor.y === 'number' && Number.isFinite(input.anchor.y)
          ? input.anchor.y
          : current.anchor?.y
    };
  }

  if (input.position) {
    updates.position = {
      x:
        typeof input.position.x === 'number' && Number.isFinite(input.position.x)
          ? input.position.x
          : current.position?.x,
      y:
        typeof input.position.y === 'number' && Number.isFinite(input.position.y)
          ? input.position.y
          : current.position?.y
    };
  }

  if (typeof input.scaleMultiplier === 'number' && Number.isFinite(input.scaleMultiplier)) {
    updates.scaleMultiplier = input.scaleMultiplier;
  }

  if (typeof input.targetHeightRatio === 'number' && Number.isFinite(input.targetHeightRatio)) {
    updates.targetHeightRatio = input.targetHeightRatio;
  }

  if ('voiceId' in input) {
    if (typeof input.voiceId === 'string') {
      const trimmed = input.voiceId.trim();
      updates.voiceId = trimmed.length > 0 ? trimmed : null;
    } else if (input.voiceId === null) {
      updates.voiceId = null;
    }
  }

  if (typeof input.modelPath === 'string' && input.modelPath.trim()) {
    const normalized = sanitizeRelativePath(input.modelPath.trim().replace(/.*\/models\/custom\//, ''));
    if (!normalized) {
      throw new Error('Invalid model path.');
    }

    if (!current.availableModelFiles.includes(normalized)) {
      throw new Error('modelPath must reference a file inside the uploaded project.');
    }

    updates.modelPath = normalized;
  }

  const next: StoredLive2DModel = {
    ...current,
    ...updates,
    updatedAt: Date.now()
  };

  const nextList = [...existing];
  nextList[index] = next;
  await writeDataFile(nextList);

  return mapStoredToRecord(next);
};

export const deleteModel = async (id: string): Promise<void> => {
  const existing = await readDataFile();
  const index = existing.findIndex((model) => model.id === id);
  if (index === -1) {
    throw new Error('Model not found.');
  }

  const [removed] = existing.splice(index, 1);
  await writeDataFile(existing);

  if (removed?.slug) {
    const dir = path.join(CUSTOM_MODELS_ROOT, removed.slug);
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
    }
  }
};

export const getModelDirectorySize = async (id: string): Promise<number | null> => {
  const existing = await readDataFile();
  const found = existing.find((model) => model.id === id);
  if (!found) return null;

  const dir = path.join(CUSTOM_MODELS_ROOT, found.slug);
  if (!existsSync(dir)) return null;

  const stack = [dir];
  let total = 0;

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        const fileStat = await stat(entryPath);
        total += fileStat.size;
      }
    }
  }

  return total;
};
