<script lang="ts">
	import { Live2DPreview } from '$lib';
	import { writable } from 'svelte/store';

	interface ModelOption {
		label: string;
		modelPath: string;
		cubismCorePath?: string;
		anchor?: { x?: number; y?: number };
		position?: { x?: number; y?: number };
		scaleMultiplier?: number;
		targetHeightRatio?: number;
	}

	const demoModels: ModelOption[] = [
		{
			label: 'Hiyori',
			modelPath: '/models/hiyori/hiyori_free_t08.model3.json',
			scaleMultiplier: 1,
			anchor: { x: 0.5, y: 0.4 },
			position: { x: 0.5, y: 0.4 }
		},
		{
			label: 'Miku',
			modelPath: '/models/miku/runtime/miku.model3.json',
			scaleMultiplier: 0.85,
			anchor: { x: 0.5, y: 0.2 },
			position: { x: 0.5, y: 0.3 }
		}
	];

	const activeModelIndex = writable<number>(0);
	let currentModel: ModelOption = demoModels[0];

	const selectModel = (index: number) => {
		const option = demoModels[index];
		if (!option) return;
		activeModelIndex.set(index);
	};

	$: currentModel = demoModels[$activeModelIndex] ?? demoModels[0];
</script>

<section class="page">
	<div class="copy">
		<h1>Live2D Cubism Preview</h1>
		<p>
			Experiment with multiple Cubism models bundled in <code>static/models</code>. Use the buttons to
			switch between configurations and confirm positioning or scaling tweaks.
		</p>
		<div class="controls" role="group" aria-label="Choose a Live2D model">
			{#each demoModels as model, index (model.label)}
				<button
					type="button"
					class:active={index === $activeModelIndex}
					aria-pressed={index === $activeModelIndex}
					on:click={() => selectModel(index)}
				>
					{model.label}
				</button>
			{/each}
		</div>
	</div>
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
</section>

<style>
	.page {
		display: grid;
		gap: 2rem;
		padding: 4rem 1.5rem;
		max-width: 960px;
		margin: 0 auto;
		align-items: center;
	}

	.copy {
		display: grid;
		gap: 1rem;
		text-align: center;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		justify-content: center;
		margin-top: 1rem;
	}

	.controls button {
		padding: 0.65rem 1.1rem;
		border-radius: 9999px;
		border: 1px solid rgba(0, 0, 0, 0.15);
		background: rgba(255, 255, 255, 0.8);
		box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
		font-size: 0.95rem;
		font-weight: 500;
		transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
		cursor: pointer;
	}

	.controls button:hover {
		transform: translateY(-1px);
		box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
	}

	.controls button:focus-visible {
		outline: 3px solid rgba(99, 102, 241, 0.4);
		outline-offset: 2px;
	}

	.controls button.active {
		background: linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(59, 130, 246, 0.9));
		color: white;
		border-color: transparent;
		box-shadow: 0 16px 30px rgba(59, 130, 246, 0.25);
	}

	.copy h1 {
		font-size: clamp(2rem, 4vw, 3rem);
		font-weight: 600;
	}

	.copy p {
		color: rgba(0, 0, 0, 0.7);
		line-height: 1.6;
	}

	code {
		font-size: 0.95rem;
		background: rgba(0, 0, 0, 0.05);
		padding: 0.15rem 0.35rem;
		border-radius: 0.5rem;
	}

	@media (min-width: 768px) {
		.page {
			grid-template-columns: 1fr 1.1fr;
			align-items: stretch;
		}

		.copy {
			text-align: left;
			align-content: center;
		}

		.controls {
			justify-content: flex-start;
		}
	}
</style>
