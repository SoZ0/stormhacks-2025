<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value = '';
  export let isSending = false;
  export let isDisabled = false;

  const dispatch = createEventDispatcher<{ send: void }>();

  const emitSend = () => {
    if (!isSending && !isDisabled) {
      dispatch('send');
    }
  };

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      emitSend();
    }
  };

</script>

<div class="input-bar">
  <textarea
    bind:value
    rows="1"
    placeholder="Send a message..."
    on:keydown={handleKey}
    disabled={isSending || isDisabled}
  ></textarea>
  <button
    class="send-btn"
    type="button"
    on:click={emitSend}
    disabled={isSending || isDisabled}
    aria-busy={isSending}
  >
    {#if isSending}
      ...
    {:else}
      ➤
    {/if}
  </button>
</div>

<style>
  .input-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #40414f;
    padding: 10px 16px;
    border-radius: 12px;
    position: sticky;
    bottom: 0;
  }

  textarea {
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
    min-width: 42px;
  }

  .send-btn:hover {
    background: #0d8c6c;
  }

  .send-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
