<script lang="ts">
    import { onMount } from "svelte";
    import { fly } from "svelte/transition";
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
		},
        {
			label: 'HuoHuo',
			modelPath: '/models/huohuo/huohuo.model3.json',
			scaleMultiplier: 1,
			anchor: { x: 0.5, y: 0.4 },
			position: { x: 0.5, y: 0.4 }
		}
	];

	const activeModelIndex = writable<number>(2);
	let currentModel: ModelOption = demoModels[2];

	const selectModel = (index: number) => {
		const option = demoModels[index];
		if (!option) return;
		activeModelIndex.set(index);
	};

	$: currentModel = demoModels[$activeModelIndex] ?? demoModels[0];
    /**
    * messaging script or wtv in here
    * 
     */


    // message structure
    interface Message {
        sender: "user" | "bot";
        text: string;
    }

    // state
    let isCollapsed = false;
    let messages: Message[] = [
        { sender: "bot", text: "Hi there! How can I help you today?" }
    ];
    let input = "";

    // toggles sidebar
    function toggleSidebar(): void {
        isCollapsed = !isCollapsed;
    }

    // sends a message
    function sendMessage(): void {
        if (!input.trim()) return;
        messages = [...messages, { sender: "user", text: input }];
        input = "";

        // fake bot reply after 1s
        setTimeout(() => {
        messages = [
            ...messages,
            { sender: "bot", text: "I'm just a demo, but I heard you!" }
        ];
        }, 1000);
    }

    // submit on enter
    function handleKey(e: KeyboardEvent): void {
        if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
        }
    }

    // start collapsed on small screens
    onMount(() => {
        if (window.innerWidth <= 800) isCollapsed = true;
    });
</script>
		
	


<!-- markup -->
<button class="toggle-btn" on:click={toggleSidebar}>☰</button>

<div class="layout">
    <!-- sidebar -->
    <aside class="sidebar {isCollapsed ? 'collapsed' : ''}" transition:fly={{ x: -200, duration: 250 }}>
        <div class="pt-12">
            <button class="new-chat-btn" on:click={() => (messages = [])}>+ New Chat</button>
        </div>
        <div class="chat-list">
        <h3>Recent Chats</h3>
        <ul>
            <li>General Inquiry</li>
            <li>Support</li>
            <li>Agent A</li>
        </ul>
        </div>
    </aside>
    

    <div class="flex flex-col md:flex-row w-full h-full">
        <!-- chat area -->
        <section class="chat-area relative w-full h-full ">
            <div class="messages">
            {#each messages as msg (msg.text)}
                <div class="message {msg.sender}" transition:fly={{ y: 10, duration: 150 }}>
                {msg.text}
                </div>
            {/each}
            </div>
            
            <div class="flex justify-center pb-10">
                <div class="input-bar rounded-3xl w-5/6">
                    <textarea
                        bind:value={input}
                        rows="1"
                        placeholder="Send a message..."
                        on:keydown={handleKey}
                    ></textarea>
                    <button class="send-btn" on:click={sendMessage}>➤</button>
                </div>
            </div>
            
        </section>


        <div class="flex w-1/3 h-full">
            <div class="absolute z-50 h-full right-0 w-1/3">
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

                        <div role="group" aria-label="Choose a Live2D model">
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
        </div>
    </div>
</div>


<style>
    :global(body) {
        margin: 0;
        font-family: system-ui, sans-serif;
        background: #343541;
        color: #ececf1;
        overflow: hidden;
    }

    .layout {
        display: flex;
        height: 100vh;
    }

    /* sidebar */
    .sidebar {
        width: 260px;
        background: #202123;
        color: #ececf1;
        padding: 20px;
        box-sizing: border-box;
        transition: transform 0.3s ease;
        overflow-y: auto;
    }
    .sidebar.collapsed {
        transform: translateX(-100%);
    }

    .new-chat-btn {
        background: #10a37f;
        border: none;
        color: white;
        padding: 10px;
        width: 100%;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
        margin-bottom: 20px;
    }
    .new-chat-btn:hover {
        background: #0d8c6c;
    }

    .chat-list h3 {
        font-size: 0.9rem;
        color: #8e8e8f;
        margin-bottom: 10px;
    }
    .chat-list li {
        background: #2a2b32;
        padding: 8px 10px;
        border-radius: 6px;
        margin-bottom: 8px;
        cursor: pointer;
    }
    .chat-list li:hover {
        background: #3b3c42;
    }

    /* toggle */
    .toggle-btn {
        position: fixed;
        top: 15px;
        left: 15px;
        background: #444654;
        color: white;
        border: none;
        padding: 8px 10px;
        border-radius: 6px;
        cursor: pointer;
        z-index: 1001;
        font-size: 18px;
    }
    .toggle-btn:hover {
        background: #5c5e70;
    }

    /* chat main area */
    .chat-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        background: #343541;
        position: relative;
        transition: margin-left 0.3s ease;
    }

    .messages {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .message {
        max-width: 70%;
        padding: 12px 16px;
        border-radius: 10px;
        line-height: 1.4;
        word-wrap: break-word;
    }

    .bot {
        background: #444654;
        align-self: flex-start;
    }

    .user {
        background: #10a37f;
        align-self: flex-end;
    }

    /* input bar */
    .input-bar {
        position: sticky;
        bottom: 0;
        background: #40414f;
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .input-bar textarea {
        flex: 1;
        resize: none;
        border: none;
        border-radius: 8px;
        padding: 10px;
        font-size: 1rem;
        background: #40414f;
        color: white;
        outline: none;
    }

    .send-btn {
        background: #10a37f;
        border: none;
        color: white;
        padding: 10px 14px;
        border-radius: 6px;
        cursor: pointer;
    }
    .send-btn:hover {
        background: #0d8c6c;
    }

    @media (max-width: 800px) {
        .sidebar {
        position: fixed;
        height: 100%;
        top: 0;
        left: 0;
        z-index: 1000;
        }
        .chat-area {
        margin-left: 0 !important;
        }
    }
</style>