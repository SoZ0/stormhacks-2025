<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { ChatMessagePayload } from '$lib/llm/client';

  export let messages: ChatMessagePayload[] = [];
</script>

<div class="messages">
  {#each messages as msg, index (index)}
    <div class={`message ${msg.sender}`} transition:fly={{ y: 10, duration: 150 }}>
      {msg.text}
    </div>
  {/each}
</div>

<style>
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

  .message.bot {
    background: #444654;
    align-self: flex-start;
  }

  .message.user {
    background: #10a37f;
    align-self: flex-end;
  }
</style>
