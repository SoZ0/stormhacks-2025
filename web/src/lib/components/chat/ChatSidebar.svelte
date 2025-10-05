<script lang="ts">
  import { fly } from 'svelte/transition';
  import { createEventDispatcher } from 'svelte';

  export let isCollapsed = false;
  export let settingsHref = '#';
  export let isPersistingSettings = false;
  export let settingsPersistError: string | null = null;

  const dispatch = createEventDispatcher<{ newChat: void }>();

  const handleNewChat = () => {
    dispatch('newChat');
  };
</script>

<aside
  class={`sidebar ${isCollapsed ? 'collapsed' : ''}`}
  transition:fly={{ x: -200, duration: 250 }}
>
  <div class="pt-12">
    <button class="new-chat-btn" type="button" on:click={handleNewChat}>
      + New Chat
    </button>
  </div>

  <div class="chat-list">
    <h3>Recent Chats</h3>
    <ul>
      <li>General Inquiry</li>
      <li>Support</li>
      <li>Agent A</li>
    </ul>
  </div>

  <div class="config-meta">
    <a class="settings-link" href={settingsHref}>Open LLM settings</a>
    {#if isPersistingSettings}
      <span class="config-hint saving">Saving…</span>
    {:else if settingsPersistError}
      <span class="config-error">{settingsPersistError}</span>
    {/if}
  </div>
</aside>

<style>
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

  .config-meta {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 100%;
    font-size: 0.75rem;
    color: #8e8e8f;
  }

  .settings-link {
    color: #10a37f;
    text-decoration: none;
    font-weight: 600;
  }

  .settings-link:hover {
    text-decoration: underline;
  }

  .config-hint,
  .config-error {
    margin: 0;
    font-size: 0.75rem;
  }

  .config-hint {
    color: #8e8e8f;
  }

  .config-hint.saving {
    color: #cfcfd3;
  }

  .config-error {
    color: #ff9aa2;
  }

  @media (max-width: 800px) {
    .sidebar {
      position: fixed;
      height: 100%;
      top: 0;
      left: 0;
      z-index: 1000;
    }
  }
</style>
