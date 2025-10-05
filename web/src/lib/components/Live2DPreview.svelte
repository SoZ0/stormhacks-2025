<script lang="ts" context="module">
    import type { Live2DModelStorage } from '$lib/live2d/types';

    export type Live2DPreviewConfig = {
        modelPath?: string | null;
        cubismCorePath?: string;
        anchor?: { x?: number; y?: number };
        position?: { x?: number; y?: number };
        scaleMultiplier?: number;
        targetHeightRatio?: number;
        storage?: Live2DModelStorage;
        localModelId?: string | null;
    };
</script>

<script lang="ts">
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { base } from '$app/paths';
    import { Application, type IApplicationOptions } from 'pixi.js';
    import { Ticker } from '@pixi/ticker';
    import type { Live2DModel as Live2DModelType } from 'pixi-live2d-display/cubism4';
    import { getLocalModelBundle } from '$lib/live2d/client';
    import type { LocalModelAssetBundle } from '$lib/live2d/local-store';

	interface Live2DWindow extends Window {
		Live2DCubismCore?: unknown;
	}

	type Nullable<T> = T | null | undefined;

	interface ModelConfig {
		modelUrl: string;
		coreSrc: string;
	}

	let container: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let app: Application | null = null;
	let model: Live2DModelType | null = null;
    export let expressions: string[] = [];

export function setExpression(name: string) {
(model as any)?.expression?.(name);
}

const exprNames = async (m: any, url: string): Promise<string[]> => {
const s = m?.internalModel?.settings || m?.internalModel?._settings || m?.settings;
const pick = (arr: any[]) =>
arr
.map((e: any) => e?.Name || (e?.File && String(e.File).replace(/.exp3.json$/i, '')))
.filter((n: any) => typeof n === 'string' && n.trim());
const fromSettings = pick((s?.FileReferences?.Expressions ?? []) as any[]);
if (fromSettings.length) return fromSettings;
try {
const j = await (await fetch(url, { cache: 'no-cache' })).json();
return pick((j?.FileReferences?.Expressions ?? []) as any[]);
} catch {
return [];
}
};



	const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value) || value.startsWith('//');

	const joinSegments = (...segments: Nullable<string>[]) =>
		segments
			.filter((segment): segment is string => typeof segment === 'string')
			.flatMap((segment) => segment.split('/'))
			.filter(Boolean)
			.join('/');

	const normalizeLocalPath = (path: string) => `/${joinSegments(path)}`;

	const staticPathFor = (path: string) => {
		if (!path) return base || '';
		if (isAbsoluteUrl(path)) return path;
		return `${base}${normalizeLocalPath(path)}`;
	};

	const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

	const cubismCorePromises = new Map<string, Promise<void>>();

	const DEFAULT_MODEL_PATH = '/models/hiyori/runtime/hiyori_pro_t11.model3.json';
	const DEFAULT_CUBISM_CORE_PATH = '/vendor/live2d/live2dcubismcore.min.js';
	const DEFAULT_ANCHOR: { x: number; y: number } = { x: 0.5, y: 0.5 };
	const DEFAULT_POSITION: { x: number; y: number } = { x: 0.5, y: 0.95 };
	const DEFAULT_TARGET_HEIGHT_RATIO = 0.9;
	const DEFAULT_SCALE_MULTIPLIER = 1;

	export let config: Live2DPreviewConfig = { modelPath: DEFAULT_MODEL_PATH };
export let pixiOptions: Partial<IApplicationOptions> = {};
export let loading = false;

	let anchorX = DEFAULT_ANCHOR.x;
	let anchorY = DEFAULT_ANCHOR.y;
	let positionX = DEFAULT_POSITION.x;
	let positionY = DEFAULT_POSITION.y;
	let targetHeightRatio = DEFAULT_TARGET_HEIGHT_RATIO;
	let scaleMultiplier = DEFAULT_SCALE_MULTIPLIER;
	let resolvedModelUrl = staticPathFor(DEFAULT_MODEL_PATH);
	let resolvedCubismCoreSrc = staticPathFor(DEFAULT_CUBISM_CORE_PATH);

	let localBundle: LocalModelAssetBundle | null = null;
	let sourceToken = 0;
	let lastLocalKey = '';

	const cleanupLocalBundle = () => {
		localBundle?.dispose();
		localBundle = null;
		lastLocalKey = '';
	};

	$: resolvedCubismCoreSrc = staticPathFor(
		config?.cubismCorePath ?? DEFAULT_CUBISM_CORE_PATH
	);

	$: void (async () => {
		const storage = config?.storage;
		const desiredPath = config?.modelPath ?? DEFAULT_MODEL_PATH;

		if (storage === 'local') {
			if (!browser || !config?.localModelId) return;
			const bundleKey = `${config.localModelId}::${desiredPath ?? ''}`;
			if (localBundle && bundleKey === lastLocalKey) {
				return;
			}
			const token = ++sourceToken;
			try {
				const bundle = await getLocalModelBundle(config.localModelId, desiredPath ?? undefined);
				if (token !== sourceToken) {
					bundle.dispose();
					return;
				}
				cleanupLocalBundle();
				localBundle = bundle;
				lastLocalKey = bundleKey;
				resolvedModelUrl = bundle.modelUrl;
			} catch (error) {
				if (token === sourceToken) {
					console.error('Live2DPreview: failed to prepare local model bundle', error);
				}
			}
			return;
		}

		cleanupLocalBundle();
		const resolved = staticPathFor(desiredPath ?? DEFAULT_MODEL_PATH);
		resolvedModelUrl = resolved;
	})();
	$: anchorX = config?.anchor?.x ?? DEFAULT_ANCHOR.x;
	$: anchorY = config?.anchor?.y ?? DEFAULT_ANCHOR.y;
	$: positionX = config?.position?.x ?? DEFAULT_POSITION.x;
	$: positionY = config?.position?.y ?? DEFAULT_POSITION.y;
	$: targetHeightRatio = config?.targetHeightRatio ?? DEFAULT_TARGET_HEIGHT_RATIO;
	$: scaleMultiplier = config?.scaleMultiplier ?? DEFAULT_SCALE_MULTIPLIER;

	const ensureCubismCore = async (src: string) => {
		if (typeof window === 'undefined') return;

		const live2dWindow = window as Live2DWindow;

		if (live2dWindow.Live2DCubismCore) return;

		const existingPromise = cubismCorePromises.get(src);
		if (existingPromise) return existingPromise;

		const loadPromise = new Promise<void>((resolve, reject) => {
			const handleLoad = (element: HTMLScriptElement) => {
				element.dataset.loaded = 'true';
				resolve();
			};

			const handleError = () => {
				reject(new Error('Failed to load Live2D Cubism core script.'));
			};

			const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);

			if (existing) {
				if (existing.dataset.loaded === 'true' || live2dWindow.Live2DCubismCore) {
				resolve();
				return;
			}

				existing.addEventListener('load', () => handleLoad(existing), { once: true });
				existing.addEventListener('error', handleError, { once: true });
			return;
			}

			const script = document.createElement('script');
			script.src = src;
			script.async = true;
			script.crossOrigin = 'anonymous';
			script.dataset.loaded = 'pending';
			script.addEventListener('load', () => handleLoad(script), { once: true });
			script.addEventListener('error', handleError, { once: true });
			document.head.appendChild(script);
		});

		cubismCorePromises.set(
			src,
			loadPromise.catch((error) => {
				cubismCorePromises.delete(src);
				throw error;
			})
		);

		return cubismCorePromises.get(src);
	};

	let updateLayoutFn: (() => void) | null = null;

	const disposeModel = () => {
		if (!model) return;

		const activeApp = app;
		if (activeApp) {
			activeApp.stage.removeChild(model);
		}

		model.destroy();
		model = null;
		updateLayoutFn = null;
	};

	const applyLayout = () => {
		if (!container || !model) return;

		const { clientWidth, clientHeight } = container;
		const rawHeight = (() => {
			const currentScaleY = model.scale?.y ?? 1;
			const estimated = model.height || model.getBounds().height || 1;
			return currentScaleY !== 0 ? estimated / currentScaleY : estimated;
		})();
		const heightRatio = Number.isFinite(targetHeightRatio) ? targetHeightRatio : 0.9;
		const targetHeight = Math.max(clientHeight * heightRatio, 1);
		const baseScale = targetHeight / Math.max(rawHeight, 1);
		const multiplier = Number.isFinite(scaleMultiplier) ? scaleMultiplier : 1;
		const currentScaleX = model.scale?.x ?? 1;
		const currentScaleY = model.scale?.y ?? 1;
		const directionX = currentScaleX < 0 ? -1 : 1;
		const directionY = currentScaleY < 0 ? -1 : 1;
		const xRatio = Number.isFinite(positionX) ? positionX : 0.5;
		const yRatio = Number.isFinite(positionY) ? positionY : 0.95;

		model.scale.set(baseScale * multiplier * directionX, baseScale * multiplier * directionY);
		model.position.set(clientWidth * xRatio, clientHeight * yRatio);
	};

	$: if (model) {
		model.anchor.set(clamp(anchorX, 0, 1), clamp(anchorY, 0, 1));
		updateLayoutFn?.();
	}

	$: {
		if (model) {
			void targetHeightRatio;
			void scaleMultiplier;
			void positionX;
			void positionY;
			updateLayoutFn?.();
		}
	}

	let tickerRegistered = false;
	let loadToken = 0;
	let inFlightModelConfig: ModelConfig | null = null;
	let loadedModelConfig: ModelConfig | null = null;

	const configsEqual = (a: ModelConfig | null, b: ModelConfig | null) =>
		a?.modelUrl === b?.modelUrl && a?.coreSrc === b?.coreSrc;

	/* eslint-disable svelte/infinite-reactive-loop */
	const reloadModel = async (modelUrl: string, coreSrc: string) => {
		if (!app || !container || !canvas) return;

		const token = ++loadToken;
		inFlightModelConfig = { modelUrl, coreSrc };
		loading = true;

		try {
			await ensureCubismCore(coreSrc);
			const { Live2DModel } = await import('pixi-live2d-display/cubism4');

			if (!tickerRegistered) {
				Live2DModel.registerTicker(Ticker);
				tickerRegistered = true;
			}

			const loadedModel = await Live2DModel.from(modelUrl);
			loadedModel.autoUpdate = false;

			if (token !== loadToken || !app || !container) {
				loadedModel.destroy();
				return;
			}

			disposeModel();

			model = loadedModel;
			app.stage.addChild(model);
			model.anchor.set(clamp(anchorX, 0, 1), clamp(anchorY, 0, 1));
			model.update(0);
			applyLayout();

            expressions = await exprNames(model, modelUrl);
            const def = expressions[0];
            if (def) (model as any)?.expression?.(def);
			updateLayoutFn = applyLayout;
			loadedModelConfig = { modelUrl, coreSrc };
		} catch (error) {
			if (token === loadToken) {
				loadedModelConfig = null;
			}
			console.error('Live2DPreview: failed to load model', error);
		} finally {
			if (token === loadToken) {
				inFlightModelConfig = null;
				loading = false;
			}
		}
	};

	$: {
		if (app && container && canvas) {
			const desiredConfig: ModelConfig = {
				modelUrl: resolvedModelUrl,
				coreSrc: resolvedCubismCoreSrc
			};

			const hasPaths = Boolean(desiredConfig.modelUrl && desiredConfig.coreSrc);
			const alreadyLoaded = configsEqual(desiredConfig, loadedModelConfig);
			const loadingSame = configsEqual(desiredConfig, inFlightModelConfig);

			if (hasPaths && !alreadyLoaded && !loadingSame) {
				void reloadModel(desiredConfig.modelUrl, desiredConfig.coreSrc);
			}
		}
	}
	/* eslint-enable svelte/infinite-reactive-loop */

	onMount(() => {
		let destroyed = false;
		let teardown: (() => void) | null = null;

		const init = async () => {
			if (!container || !canvas) return;

			const options: Partial<IApplicationOptions> = {
				backgroundAlpha: 0,
				antialias: true,
				autoStart: true,
				autoDensity: true,
				...pixiOptions,
				view: canvas
			};

			if (!('resizeTo' in options) || options.resizeTo == null) {
				options.resizeTo = container;
			}

			app = new Application(options);
			const currentApp = app;

			if (destroyed) {
				currentApp.destroy(true);
				app = null;
				return;
			}

			const resizeObserver = new ResizeObserver(() => applyLayout());
			resizeObserver.observe(container);

			const ticker = currentApp.ticker ?? Ticker.shared;
			const tick = () => {
				if (!model) return;
				model.update(ticker.deltaMS);
			};

			ticker.add(tick);

			teardown = () => {
				resizeObserver.disconnect();
				ticker.remove(tick);
				disposeModel();
			};
		};

		void init();

		return () => {
			destroyed = true;
			teardown?.();
			loadToken += 1;
			disposeModel();
			app?.destroy(true);
			app = null;
			inFlightModelConfig = null;
			loadedModelConfig = null;
			loading = false;
			cleanupLocalBundle();
		};
	});
</script>

<div class="relative h-full w-full overflow-hidden" bind:this={container}>
	<canvas
		bind:this={canvas}
		aria-label="Live2D preview"
		class="absolute inset-0 h-full w-full"
	></canvas>
	<noscript class="absolute inset-x-0 bottom-4 mx-auto max-w-xs rounded-md bg-surface-900/90 px-3 py-2 text-center text-xs text-surface-100 shadow-lg">
		Enable JavaScript to preview the Live2D model.
	</noscript>
</div>
