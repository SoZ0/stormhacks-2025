import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workerFactoryMarker = "var WorkerFactory = createBase64WorkerFactory(";

const decodeWorker = (base64: string): string => Buffer.from(base64, 'base64').toString('utf8');
const encodeWorker = (source: string): string => Buffer.from(source, 'utf8').toString('base64');

const syncOriginalPattern = /function syncFilesystem\(fromPersistent\)\{return new Promise\(\(resolve,reject\)=>FS\.syncfs\(fromPersistent,err=>\{if\(err\)\{reject\("Failed to sync file system: "\+err\);\}else \{log\("File system synced "\+\(fromPersistent\?"from host to runtime":"from runtime to host"\),2\);resolve\(\);\}\}\)\)\}/;

const syncReplacement = [
  'let persistenceEnabled = true;',
  'function syncFilesystem(fromPersistent) {',
  '  if (!persistenceEnabled) {',
  '    log("Skipping file system sync; persistence disabled", 1);',
  '    return Promise.resolve();',
  '  }',
  '  return new Promise((resolve) => FS.syncfs(fromPersistent, (err) => {',
  '    if (err) {',
  '      const direction = fromPersistent ? "from host to runtime" : "from runtime to host";',
  '      log(`Disabling persistent storage after sync failure (${direction}): ${err}`, 1);',
  '      persistenceEnabled = false;',
  '      resolve();',
  '      return;',
  '    }',
  '    log(`File system synced ${fromPersistent ? "from host to runtime" : "from runtime to host"}`, 2);',
  '    resolve();',
  '  }));',
  '}'
].join('\n');

const removeRecognizerPattern = /const recognizer = this\.recognizers\.get\(recognizerId\);\s+const finalResult = recognizer\.recognizer\.FinalResult\(\);\s+this\.freeBuffer\(recognizer\);\s+recognizer\.recognizer\.delete\(\);\s+this\.recognizers\.delete\(recognizerId\);\s+return \{\s+event: "result",\s+recognizerId,\s+result: JSON\.parse\(finalResult\),\s+};/;

const removeRecognizerReplacement = [
  'const recognizerEntry = this.recognizers.get(recognizerId);',
  'if (!recognizerEntry || !recognizerEntry.recognizer) {',
  '    this.logger.warn(`Recognizer (id: ${recognizerId}): Native instance missing; skipping cleanup`);',
  '    this.recognizers.delete(recognizerId);',
  '    return {',
  '        event: "result",',
  '        recognizerId,',
  '        result: { text: "" },',
  '    };',
  '}',
  'const nativeRecognizer = recognizerEntry.recognizer;',
  'const finalResultJson = typeof nativeRecognizer.FinalResult === "function"',
  '    ? nativeRecognizer.FinalResult()',
  '    : "{\"text\":\"\"}";',
  'this.freeBuffer(recognizerEntry);',
  'try {',
  '    nativeRecognizer.delete?.();',
  '} catch (error) {',
  '    this.logger.warn(`Recognizer (id: ${recognizerId}): Failed to delete native instance: ${error}`);',
  '}',
  'this.recognizers.delete(recognizerId);',
  'return {',
  '    event: "result",',
  '    recognizerId,',
  '    result: JSON.parse(finalResultJson),',
  '};'
].join('\n');

const patchWorkerSource = (source: string): { changed: boolean; result: string } => {
  let updated = source;
  let changed = false;

  if (!updated.includes('let persistenceEnabled') && syncOriginalPattern.test(updated)) {
    updated = updated.replace(syncOriginalPattern, syncReplacement);
    changed = true;
  }

  if (!updated.includes('nativeRecognizer') && removeRecognizerPattern.test(updated)) {
    updated = updated.replace(removeRecognizerPattern, removeRecognizerReplacement);
    changed = true;
  }

  return { changed, result: updated };
};

const extractWorker = (fileContents: string) => {
  const markerIndex = fileContents.indexOf(workerFactoryMarker);
  if (markerIndex === -1) {
    throw new Error('Unable to locate worker factory marker');
  }

  let cursor = markerIndex + workerFactoryMarker.length;
  const quoteChar = fileContents[cursor];
  if (quoteChar !== '"' && quoteChar !== '\'') {
    throw new Error('Unexpected worker payload delimiter');
  }
  cursor += 1;
  let base64 = '';
  while (cursor < fileContents.length) {
    const char = fileContents[cursor];
    if (char === quoteChar && fileContents[cursor - 1] !== '\\') {
      break;
    }
    base64 += char;
    cursor += 1;
  }

  if (!base64) {
    throw new Error('Empty worker payload extracted');
  }

  return { base64, start: markerIndex + workerFactoryMarker.length + 1, end: cursor };
};

const patchFile = (target: string) => {
  if (!existsSync(target)) {
    return false;
  }

  const fileContents = readFileSync(target, 'utf8');
  if (!fileContents.includes(workerFactoryMarker)) {
    return false;
  }

  let payload;
  try {
    payload = extractWorker(fileContents);
  } catch (error) {
    console.warn(`[vosk] Skipping ${target}: ${(error as Error).message}`);
    return false;
  }

  const workerSource = decodeWorker(payload.base64);
  const { changed, result } = patchWorkerSource(workerSource);

  if (!changed) {
    console.log(`[vosk] No changes required for ${path.relative(__dirname, target)}`);
    return false;
  }

  const patchedBase64 = encodeWorker(result);
  const updatedFile = `${fileContents.slice(0, payload.start)}${patchedBase64}${fileContents.slice(payload.end)}`;
  writeFileSync(target, updatedFile);
  console.log(`[vosk] Patched ${path.relative(__dirname, target)}`);
  return true;
};

const baseTargets = [path.resolve(__dirname, '../node_modules/vosk-browser/dist/vosk.js')];

const viteDepsDir = path.resolve(__dirname, '../node_modules/.vite/deps');
if (existsSync(viteDepsDir)) {
  try {
    const entries = readdirSync(viteDepsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.js')) {
        continue;
      }
      baseTargets.push(path.join(viteDepsDir, entry.name));
    }
  } catch (error) {
    console.warn(`[vosk] Unable to enumerate Vite deps: ${(error as Error).message}`);
  }
}

let anyPatched = false;
for (const target of baseTargets) {
  anyPatched = patchFile(target) || anyPatched;
}

if (!anyPatched) {
  console.log('[vosk] Worker already patched');
}
