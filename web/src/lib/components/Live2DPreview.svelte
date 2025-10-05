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
    import { onDestroy, onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { base } from '$app/paths';
	import { Application, type IApplicationOptions } from '@pixi/app';
	import { extensions } from '@pixi/extensions';
	import { InteractionManager } from '@pixi/interaction';
	import type { BaseTexture, Texture as PixiTexture } from '@pixi/core';
	import { Ticker, TickerPlugin } from '@pixi/ticker';
	import type { Live2DModel as Live2DModelType } from 'pixi-live2d-display/cubism4';
	import type { Live2DMotionOption } from '$lib/live2d/types';
	import { getLocalModelBundle } from '$lib/live2d/client';
	import type { LocalModelAssetBundle } from '$lib/live2d/local-store';
	import { mouthOpen } from '$lib/live2d/mouth';
    import { live2dReaction } from '$lib/live2d/bus';

	let patchedPixiUrlResolve = false;
	const ensurePixiUrlResolvePatched = async () => {
		if (!browser || patchedPixiUrlResolve) return;
		try {
			const utils = await import('@pixi/utils');
			const pixiUrl = utils?.url as { resolve?: (from: string, to: string) => string } | undefined;
			if (!pixiUrl || typeof pixiUrl.resolve !== 'function') return;
			const originalResolve = pixiUrl.resolve.bind(pixiUrl);
			pixiUrl.resolve = (from: string, to: string) => {
				if (typeof from === 'string' && from.startsWith('blob:') && typeof to === 'string' && to.startsWith('blob:')) {
					return to;
				}
				return originalResolve(from, to);
			};
			patchedPixiUrlResolve = true;
		} catch (error) {
			console.warn('Live2DPreview: unable to patch pixi URL resolver', error);
		}
	};

	let pixiExtensionsRegistered = false;
	const ensurePixiExtensionsRegistered = () => {
		if (!browser || pixiExtensionsRegistered) return;
		pixiExtensionsRegistered = true;
		extensions.add(TickerPlugin, InteractionManager);
		const pixiWindow = window as typeof window & { PIXI?: Record<string, unknown> };
		pixiWindow.PIXI ??= {};
		pixiWindow.PIXI.Ticker ??= Ticker;
	};

	type TextureUsageGlobal = typeof globalThis & {
		__stormLive2DTextureUsage__?: Map<BaseTexture, number>;
	};

	const getBaseTextureUsage = (): Map<BaseTexture, number> => {
		const globalScope = globalThis as TextureUsageGlobal;
		if (!globalScope.__stormLive2DTextureUsage__) {
			globalScope.__stormLive2DTextureUsage__ = new Map<BaseTexture, number>();
		}
		return globalScope.__stormLive2DTextureUsage__;
	};

	const baseTextureUsage = getBaseTextureUsage();

	const trackModelTextures = (textures: PixiTexture[] | null | undefined) => {
		if (!textures?.length) return;
		for (const texture of textures) {
			const base = texture?.baseTexture;
			if (!base) continue;
			baseTextureUsage.set(base, (baseTextureUsage.get(base) ?? 0) + 1);
		}
	};

	const releaseModelTextures = (textures: PixiTexture[] | null | undefined) => {
		if (!textures?.length) return;
		for (const texture of textures) {
			const base = texture?.baseTexture;
			if (!base) {
				texture.destroy(true);
				continue;
			}
			const usage = baseTextureUsage.get(base) ?? 0;
			if (usage <= 1) {
				baseTextureUsage.delete(base);
				texture.destroy(true);
			} else {
				baseTextureUsage.set(base, usage - 1);
			}
		}
	};

	let live2dModulePromise: Promise<typeof import('pixi-live2d-display/cubism4')> | null = null;
	let live2dTickerRegistered = false;
	const loadLive2DModule = async () => {
		ensurePixiExtensionsRegistered();
		if (!live2dModulePromise) {
			live2dModulePromise = import('pixi-live2d-display/cubism4');
		}
		const module = await live2dModulePromise;
		if (!live2dTickerRegistered) {
			module.Live2DModel.registerTicker(Ticker);
			live2dTickerRegistered = true;
		}
		return module;
	};

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
	let canvasVersion = 0;
	let resizeObserver: ResizeObserver | null = null;
	let currentTicker: Ticker | null = null;
	let initializingApp = false;
	let componentDestroyed = false;
	let restartScheduled = false;
	export let expressions: string[] = [];
	export let motions: Live2DMotionOption[] = [];

	const motionMap = new Map<string, { group: string; index: number }>();
	let currentMotionId: string | null = null;
	let autoMotionQueued = false;

	export function setExpression(name: string) {
		(model as any)?.expression?.(name);
	}

	export function playMotion(id: string): boolean {
		if (!model) return false;

		const entry = motionMap.get(id);
		if (!entry) return false;

		const anyModel: any = model;

		try {
			anyModel?.internalModel?.motionManager?.stopAllMotions?.();
		} catch (error) {
			console.warn('Live2DPreview: failed to stop motions', error);
		}

		if (typeof anyModel.motion !== 'function') return false;

		const maybePromise = anyModel.motion(entry.group, entry.index) as Promise<unknown> | void;
		currentMotionId = id;

		if (maybePromise && typeof maybePromise.catch === 'function') {
			maybePromise.catch((error: unknown) => {
				if (currentMotionId === id) {
					console.warn('Live2DPreview: failed to play motion', error);
				}
			});
		}

		return true;
	}

	const scheduleMicrotask =
		typeof queueMicrotask === 'function'
			? queueMicrotask
			: (callback: () => void) => {
				void Promise.resolve().then(callback);
			};

	const exprNames = async (m: any, url: string): Promise<string[]> => {
		const settings =
			m?.internalModel?.settings || m?.internalModel?._settings || m?.settings;

		const pick = (items: any[]) =>
			items
				.map((entry: any) =>
					entry?.Name ||
					(entry?.File && String(entry.File).replace(/\.exp3\.json$/i, '')))
				.filter((value: any) => typeof value === 'string' && value.trim());

		const settingsExpressions = pick((settings?.FileReferences?.Expressions ?? []) as any[]);
		if (settingsExpressions.length) return settingsExpressions;

		try {
			const response = await fetch(url, { cache: 'no-cache' });
			const json = await response.json();
			return pick((json?.FileReferences?.Expressions ?? []) as any[]);
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
	let targetMouthOpen = 0;
	let currentMouthOpen = 0;
	let mouthParamAvailable = false;
	let mouthFormAvailable = false;
	let mouthParamErrorLogged = false;
let mouthFormErrorLogged = false;

	let idleAutoplayDelayMs: number = DEFAULT_IDLE_AUTOPLAY_DELAY_MS;
	let idleTimer: number | null = null;
	let layoutRetryHandle: number | null = null;
	let layoutRetryCancel: ((id: number) => void) | null = null;

	const unsubscribeMouth = browser
		? mouthOpen.subscribe((value) => {
				targetMouthOpen = clamp(value, 0, 1);
			})
		: () => {};

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
    // idle autoplay removed; config no longer controls any delay

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
	let contextLost = false;

	const cancelLayoutRetry = () => {
		if (layoutRetryHandle != null) {
			if (browser && layoutRetryCancel) {
				layoutRetryCancel(layoutRetryHandle);
			}
			layoutRetryHandle = null;
			layoutRetryCancel = null;
		}
	};

	const disposeModel = () => {
		if (!model) return;

		const activeApp = app;
		if (activeApp) {
			activeApp.stage.removeChild(model);
		}

		releaseModelTextures(model.textures as PixiTexture[]);
		model.destroy({ children: true });
		model = null;
		clearIdleTimer();
		updateLayoutFn = null;
		mouthParamAvailable = false;
		mouthFormAvailable = false;
		mouthParamErrorLogged = false;
		mouthFormErrorLogged = false;
		cancelLayoutRetry();
	};

	const tick = () => {
		if (!model) return;
		const smoothing = 0.25;
		currentMouthOpen += (targetMouthOpen - currentMouthOpen) * smoothing;
		if (Math.abs(targetMouthOpen) < 0.001 && Math.abs(currentMouthOpen) < 0.002) {
			currentMouthOpen = 0;
		}

		const coreModel = model.internalModel?.coreModel as
			| {
				setParameterValueById?: (id: string, value: number) => void;
			}
			| undefined;

		if (coreModel && typeof coreModel.setParameterValueById === 'function') {
			const value = clamp(currentMouthOpen, 0, 1);
			if (mouthParamAvailable) {
				try {
					coreModel.setParameterValueById('ParamMouthOpenY', value);
				} catch (error) {
					mouthParamAvailable = false;
					if (!mouthParamErrorLogged) {
						mouthParamErrorLogged = true;
						console.warn('Live2DPreview: ParamMouthOpenY unavailable for mouth animation', error);
					}
				}
			}

			if (mouthFormAvailable) {
				try {
					coreModel.setParameterValueById('ParamMouthForm', 0.5);
				} catch (error) {
					mouthFormAvailable = false;
					if (!mouthFormErrorLogged) {
						mouthFormErrorLogged = true;
						console.warn('Live2DPreview: ParamMouthForm unavailable for mouth animation', error);
					}
				}
			}
		}

		const deltaMs = currentTicker?.deltaMS ?? Ticker.shared.deltaMS;
		model.update(deltaMs);
	};

	const detachTicker = () => {
		if (currentTicker) {
			currentTicker.remove(tick);
			currentTicker = null;
		}
	};

	const detachResizeObserver = () => {
		resizeObserver?.disconnect();
		resizeObserver = null;
	};

	const refreshMouthParameterSupport = () => {
		const coreModel = model?.internalModel?.coreModel as
			| {
				getParameterIndex?: (id: string) => number;
				setParameterValueById?: (id: string, value: number) => void;
			}
			| undefined;

		if (!coreModel || typeof coreModel.setParameterValueById !== 'function') {
			mouthParamAvailable = false;
			mouthFormAvailable = false;
			return;
		}

		const canLookup = typeof coreModel.getParameterIndex === 'function';
		if (canLookup) {
			try {
				mouthParamAvailable = (coreModel.getParameterIndex!('ParamMouthOpenY') ?? -1) >= 0;
			} catch {
				mouthParamAvailable = false;
			}

			try {
				mouthFormAvailable = (coreModel.getParameterIndex!('ParamMouthForm') ?? -1) >= 0;
			} catch {
				mouthFormAvailable = false;
			}
		} else {
			mouthParamAvailable = true;
			mouthFormAvailable = true;
		}

		mouthParamErrorLogged = false;
		mouthFormErrorLogged = false;
	};

	const scheduleLayoutRetry = () => {
		if (!browser) return;
		if (layoutRetryHandle != null) return;
		if (typeof requestAnimationFrame === 'function') {
			layoutRetryCancel = cancelAnimationFrame;
			layoutRetryHandle = requestAnimationFrame(() => {
				layoutRetryHandle = null;
				layoutRetryCancel = null;
				applyLayout();
			});
			return;
		}

		layoutRetryCancel = window.clearTimeout;
		layoutRetryHandle = window.setTimeout(() => {
			layoutRetryHandle = null;
			layoutRetryCancel = null;
			applyLayout();
		}, 16);
	};

	const applyLayout = () => {
		if (!container || !model) return;

		const { clientWidth, clientHeight } = container;
		if (clientWidth <= 0 || clientHeight <= 0) {
			if (browser) {
				const style = getComputedStyle(container);
				if (style.display === 'none' || style.visibility === 'hidden') {
					cancelLayoutRetry();
					return;
				}
			}
			scheduleLayoutRetry();
			return;
		}
		cancelLayoutRetry();

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

	const onContextRestored = () => {
		contextLost = false;
	};

	const onContextLost = (event: Event) => {
		if (typeof (event as { preventDefault?: () => void }).preventDefault === 'function') {
			(event as { preventDefault: () => void }).preventDefault();
		}

		if (restartScheduled || componentDestroyed) {
			return;
		}

		restartScheduled = true;
		loading = true;
		contextLost = true;
		loadToken += 1;
		inFlightModelConfig = null;
		loadedModelConfig = null;
		detachTicker();
		detachResizeObserver();
		disposeModel();

		const lostCanvas = canvas;
		if (lostCanvas) {
			lostCanvas.removeEventListener('webglcontextlost', onContextLost as EventListener);
			lostCanvas.removeEventListener('webglcontextrestored', onContextRestored as EventListener);
		}

		if (app) {
			app.destroy(false);
			app = null;
		}

		scheduleMicrotask(() => {
			if (!componentDestroyed) {
				canvasVersion += 1;
			}
			restartScheduled = false;
		});
	};

	const initializeApp = async () => {
		if (!browser || componentDestroyed || initializingApp || app) return;
		if (!container || !canvas) return;
		initializingApp = true;
		try {
			ensurePixiExtensionsRegistered();
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

			const newApp = new Application(options);
			app = newApp;

			const canvasElement = canvas;
			canvasElement.addEventListener('webglcontextlost', onContextLost as EventListener, { passive: false });
			canvasElement.addEventListener('webglcontextrestored', onContextRestored as EventListener);

			detachResizeObserver();
			resizeObserver = new ResizeObserver(() => applyLayout());
			resizeObserver.observe(container);

			const tickerInstance = newApp.ticker ?? Ticker.shared;
			detachTicker();
			currentTicker = tickerInstance;
			currentTicker.add(tick);

			contextLost = false;
			scheduleLayoutRetry();
		} catch (error) {
			console.error('Live2DPreview: failed to initialize PIXI application', error);
		} finally {
			initializingApp = false;
		}
	};

	$: if (
		browser &&
		!componentDestroyed &&
		!app &&
		!initializingApp &&
		!restartScheduled &&
		container &&
		canvas
	) {
		void initializeApp();
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

	let loadToken = 0;

	// Removed idle timer logic in favour of explicit, tool-triggered animations
	const clearIdleTimer = () => {};
	let inFlightModelConfig: ModelConfig | null = null;
	let loadedModelConfig: ModelConfig | null = null;

	const configsEqual = (a: ModelConfig | null, b: ModelConfig | null) =>
		a?.modelUrl === b?.modelUrl && a?.coreSrc === b?.coreSrc;

	/* eslint-disable svelte/infinite-reactive-loop */
	const reloadModel = async (modelUrl: string, coreSrc: string) => {
		if (!app || !container || !canvas) return;
		if (contextLost) return;

		const token = ++loadToken;
		inFlightModelConfig = { modelUrl, coreSrc };
		loading = true;

		try {
			await ensurePixiUrlResolvePatched();
			await ensureCubismCore(coreSrc);
			const { Live2DModel } = await loadLive2DModule();

			const loadedModel = await Live2DModel.from(modelUrl);
			loadedModel.autoUpdate = false;

			if (token !== loadToken || !app || !container) {
				loadedModel.destroy();
				return;
			}

			disposeModel();

			model = loadedModel;
			app.stage.addChild(model);
			trackModelTextures(model.textures as PixiTexture[]);
			model.anchor.set(clamp(anchorX, 0, 1), clamp(anchorY, 0, 1));
			model.update(0);
			applyLayout();
			scheduleLayoutRetry();
			refreshMouthParameterSupport();

            expressions = await exprNames(model, modelUrl);
            const def = expressions[0];
            if (def) (model as any)?.expression?.(def);
			updateLayoutFn = applyLayout;
			// Build motions list from settings
			try {
				motions = [];
				motionMap.clear();
				const anyModel: any = model as any;
				const settings = anyModel?.internalModel?._settings || anyModel?.internalModel?.settings;
				const motionsDef = settings?.FileReferences?.Motions;
				if (motionsDef) {
					for (const group of Object.keys(motionsDef)) {
						const arr = motionsDef[group] || [];
						arr.forEach((item: any, index: number) => {
							const base = (item?.Name || item?.File || '').toString();
							const label = base.replace(/^.*\//, '').replace(/\.motion3\.json$/i, '') || `${group} ${index+1}`;
							const id = `${group}:${index}`;
							motions.push({ id, label, group, index });
							motionMap.set(id, { group, index });
						});
					}
				}
			} catch (e) { console.warn('Live2DPreview: failed to build motions list', e); }
			// Idle autoplay removed – animations are driven externally when prompts send

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

	// Public API: react to a prompt with optional expression and motion
	export function react(options: { expression?: string; motionId?: string } = {}): boolean {
		const { expression, motionId } = options;
		let ok = true;
		if (expression) {
			try { setExpression(expression); } catch { ok = false; }
		}
		if (motionId) {
			ok = playMotion(motionId) && ok;
		}
		return ok;
	}

	$: {
		if (model && !inFlightModelConfig) {
			loading = false;
		}
	}

	$: {
		if (app && container && canvas && !contextLost) {
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
		componentDestroyed = false;
		void initializeApp();

		const unsubscribeReaction = live2dReaction.subscribe((evt) => {
			if (!evt) return;
			try { react({ expression: evt.expression, motionId: evt.motionId }); } catch {}
		});

		return () => {
			componentDestroyed = true;
			restartScheduled = false;
			loadToken += 1;
			detachTicker();
			detachResizeObserver();
			if (canvas) {
				canvas.removeEventListener('webglcontextlost', onContextLost as EventListener);
				canvas.removeEventListener('webglcontextrestored', onContextRestored as EventListener);
			}
			disposeModel();
			if (app) {
				app.destroy(false);
				app = null;
			}
			inFlightModelConfig = null;
			loadedModelConfig = null;
			loading = false;
			cleanupLocalBundle();
			unsubscribeReaction();
		};
	});

	onDestroy(() => {
		unsubscribeMouth();
	});
</script>


<div class="relative h-full w-full overflow-hidden" bind:this={container}>
	{#key canvasVersion}
		<canvas
			bind:this={canvas}
			aria-label="Live2D preview"
			class="absolute inset-0 h-full w-full"
		></canvas>
	{/key}
	<noscript class="absolute inset-x-0 bottom-4 mx-auto max-w-xs rounded-md bg-surface-900/90 px-3 py-2 text-center text-xs text-surface-100 shadow-lg">
		Enable JavaScript to preview the Live2D model.
	</noscript>
</div>
