import "./DIQkfzf6.js";
import { i as init } from "./BActlzJV.js";
import { a8 as listen_to_event_and_reset_event, a9 as tick, u as untrack, r as render_effect, y as hydrating, I as current_batch, aa as previous_batch, p as push, Q as mutable_source, ab as onMount, ac as legacy_pre_effect, ad as legacy_pre_effect_reset, k as from_html, t as template_effect, g as get, ae as event, m as append, n as pop, v as sibling, o as child, T as set, af as invalidate_inner_signals, s as reset, w as set_text, ag as comment, l as first_child, ah as text, h as deep_read_state, ai as user_derived, aj as to_array } from "./T3HeJ6fH.js";
import { p as prop, i as if_block } from "./CcvXDWxI.js";
import { e as each, b as bind_select_value, s as set_attribute, r as remove_input_defaults, a as set_value } from "./BB02YFDg.js";
function bind_value(input, get2, set2 = get2) {
  var batches = /* @__PURE__ */ new WeakSet();
  listen_to_event_and_reset_event(input, "input", async (is_reset) => {
    var value = is_reset ? input.defaultValue : input.value;
    value = is_numberlike_input(input) ? to_number(value) : value;
    set2(value);
    if (current_batch !== null) {
      batches.add(current_batch);
    }
    await tick();
    if (value !== (value = get2())) {
      var start = input.selectionStart;
      var end = input.selectionEnd;
      input.value = value != null ? value : "";
      if (end !== null) {
        input.selectionStart = start;
        input.selectionEnd = Math.min(end, input.value.length);
      }
    }
  });
  if (
    // If we are hydrating and the value has since changed,
    // then use the updated value from the input instead.
    hydrating && input.defaultValue !== input.value || // If defaultValue is set, then value == defaultValue
    // TODO Svelte 6: remove input.value check and set to empty string?
    untrack(get2) == null && input.value
  ) {
    set2(is_numberlike_input(input) ? to_number(input.value) : input.value);
    if (current_batch !== null) {
      batches.add(current_batch);
    }
  }
  render_effect(() => {
    var _a;
    var value = get2();
    if (input === document.activeElement) {
      var batch = (
        /** @type {Batch} */
        (_a = previous_batch) != null ? _a : current_batch
      );
      if (batches.has(batch)) {
        return;
      }
    }
    if (is_numberlike_input(input) && value === to_number(input.value)) {
      return;
    }
    if (input.type === "date" && !value && !input.value) {
      return;
    }
    if (value !== input.value) {
      input.value = value != null ? value : "";
    }
  });
}
function is_numberlike_input(input) {
  var type = input.type;
  return type === "number" || type === "range";
}
function to_number(value) {
  return value === "" ? null : +value;
}
function stopPropagation(fn) {
  return function(...args) {
    var event2 = (
      /** @type {Event} */
      args[0]
    );
    event2.stopPropagation();
    return fn == null ? void 0 : fn.apply(this, args);
  };
}
function preventDefault(fn) {
  return function(...args) {
    var event2 = (
      /** @type {Event} */
      args[0]
    );
    event2.preventDefault();
    return fn == null ? void 0 : fn.apply(this, args);
  };
}
const DEFAULT_PROVIDER_ID = "ollama-local";
const providerTemplates = [
  {
    kind: "ollama",
    label: "Ollama",
    description: "Connect to an Ollama instance running locally or remotely.",
    defaultLabel: "Local Ollama",
    fields: [
      {
        name: "baseUrl",
        label: "Base URL",
        type: "url",
        placeholder: "http://localhost",
        required: true,
        helperText: "Protocol and host for the Ollama server."
      },
      {
        name: "port",
        label: "Port",
        type: "number",
        placeholder: "11434",
        helperText: "Leave blank to use the port in the base URL."
      }
    ]
  },
  {
    kind: "gemini",
    label: "Gemini",
    description: "Google Gemini model access via API key.",
    defaultLabel: "Gemini",
    fields: [
      {
        name: "apiKey",
        label: "API Key",
        type: "password",
        placeholder: "GEMINI_API_KEY",
        required: true,
        secret: true
      }
    ]
  }
];
const defaultProviders = [
  {
    id: DEFAULT_PROVIDER_ID,
    label: "Local Ollama",
    kind: "ollama",
    description: "Connects to a local Ollama instance (http://localhost:11434).",
    settings: {
      baseUrl: "http://localhost",
      port: "11434"
    }
  }
];
const defaultProvider = defaultProviders[0];
defaultProviders.map((provider) => ({
  id: provider.id,
  label: provider.label,
  description: provider.description,
  kind: provider.kind
}));
var root_1 = from_html(`<p class="error svelte-1mp1xum"> </p>`);
var root_2 = from_html(`<option> </option>`);
var root_3 = from_html(`<p class="hint svelte-1mp1xum">Loading providers…</p>`);
var root_5 = from_html(`<p class="error svelte-1mp1xum"> </p>`);
var root_7 = from_html(`<p class="hint svelte-1mp1xum"> </p>`);
var root_8 = from_html(`<option> </option>`);
var root_9 = from_html(`<p class="hint svelte-1mp1xum">Loading models…</p>`);
var root_11 = from_html(`<p class="error svelte-1mp1xum"> </p>`);
var root_13 = from_html(`<p class="hint svelte-1mp1xum">No models found. Check your provider configuration.</p>`);
var root_14 = from_html(`<p class="error svelte-1mp1xum"> </p>`);
var root_17 = from_html(`<p class="success svelte-1mp1xum">Preferences saved.</p>`);
var root_18 = from_html(`<p class="hint svelte-1mp1xum">A key is stored. Enter a new key to replace it or clear it below.</p>`);
var root_19 = from_html(`<p class="hint svelte-1mp1xum">Provide an ElevenLabs API key to enable voice responses.</p>`);
var root_20 = from_html(`<p class="error svelte-1mp1xum"> </p>`);
var root_25 = from_html(`<p class="success svelte-1mp1xum">Speech settings updated.</p>`);
var root_26 = from_html(`<option> </option>`);
var root_29 = from_html(`<p class="hint svelte-1mp1xum"> </p>`);
var root_28 = from_html(`<div class="field svelte-1mp1xum"><label class="svelte-1mp1xum"> </label> <input class="svelte-1mp1xum"/> <!></div>`);
var root_30 = from_html(`<p class="error svelte-1mp1xum"> </p>`);
var root_33 = from_html(`<p class="success svelte-1mp1xum">Provider added.</p>`);
var root_34 = from_html(`<p class="error svelte-1mp1xum"> </p>`);
var root_36 = from_html(`<p class="success svelte-1mp1xum">Provider removed.</p>`);
var root_38 = from_html(`<p class="provider-description svelte-1mp1xum"> </p>`);
var root_40 = from_html(`<div class="provider-setting svelte-1mp1xum"><dt class="svelte-1mp1xum"> </dt> <dd class="svelte-1mp1xum"> </dd></div>`);
var root_39 = from_html(`<dl class="svelte-1mp1xum"></dl>`);
var root_41 = from_html(`<p class="hint svelte-1mp1xum">No settings captured.</p>`);
var root_42 = from_html(`<span class="hint svelte-1mp1xum">Default provider</span>`);
var root_43 = from_html(`<button type="button" class="remove-btn svelte-1mp1xum"> </button>`);
var root_37 = from_html(`<li class="svelte-1mp1xum"><div class="provider-header svelte-1mp1xum"><span class="provider-name svelte-1mp1xum"> </span> <span class="provider-kind svelte-1mp1xum"> </span></div> <!> <!> <div class="provider-actions svelte-1mp1xum"><!></div></li>`);
var root = from_html(`<main class="settings-layout svelte-1mp1xum"><section class="panel svelte-1mp1xum"><h1 class="svelte-1mp1xum">LLM Settings</h1> <p class="intro svelte-1mp1xum">Choose the default provider and model for the chat experience. Configure additional providers below as
      needed.</p> <!> <form class="stack svelte-1mp1xum"><div class="field svelte-1mp1xum"><label for="provider" class="svelte-1mp1xum">Provider</label> <select id="provider" class="svelte-1mp1xum"></select> <!></div> <div class="field svelte-1mp1xum"><label for="model" class="svelte-1mp1xum">Model</label> <select id="model" class="svelte-1mp1xum"></select> <!></div> <!> <button type="submit" class="svelte-1mp1xum"><!></button> <!></form></section> <section class="panel svelte-1mp1xum"><h2 class="svelte-1mp1xum">Speech Settings</h2> <p class="intro svelte-1mp1xum">Configure ElevenLabs text-to-speech by adding your API key. Keys are stored securely and never exposed in
      client-side code.</p> <form class="stack svelte-1mp1xum"><div class="field svelte-1mp1xum"><label for="elevenlabs-api-key" class="svelte-1mp1xum">ElevenLabs API Key</label> <input id="elevenlabs-api-key" type="password" autocomplete="off" class="svelte-1mp1xum"/> <!></div> <!> <div class="button-row svelte-1mp1xum"><button type="submit" class="svelte-1mp1xum"><!></button> <button type="button" class="secondary svelte-1mp1xum"><!></button></div> <!></form></section> <section class="panel svelte-1mp1xum"><h2 class="svelte-1mp1xum">Add Provider</h2> <p class="intro svelte-1mp1xum">Create additional provider connections. Required fields are specific to the provider type, such as base
      URLs for Ollama or API keys for Gemini.</p> <form class="stack svelte-1mp1xum"><div class="field svelte-1mp1xum"><label for="provider-kind" class="svelte-1mp1xum">Provider Type</label> <select id="provider-kind" class="svelte-1mp1xum"></select></div> <div class="field svelte-1mp1xum"><label for="provider-name" class="svelte-1mp1xum">Display Name</label> <input id="provider-name" type="text" placeholder="My Provider" class="svelte-1mp1xum"/></div> <div class="field svelte-1mp1xum"><label for="provider-description" class="svelte-1mp1xum">Description</label> <input id="provider-description" type="text" placeholder="Optional description" class="svelte-1mp1xum"/></div> <!> <!> <button type="submit" class="secondary svelte-1mp1xum"><!></button> <!></form></section> <section class="panel svelte-1mp1xum"><h2 class="svelte-1mp1xum">Configured Providers</h2> <p class="intro svelte-1mp1xum">Review the providers currently available to the chat experience.</p> <!> <ul class="provider-list svelte-1mp1xum"></ul></section></main>`);
function LlmSettingsPanel($$anchor, $$props) {
  var _a, _b;
  push($$props, false);
  let variant = prop($$props, "variant", 8, "page");
  let providers = mutable_source([defaultProvider]);
  let providersLoading = mutable_source(false);
  let providersError = mutable_source(null);
  let computedProvidersError = mutable_source(null);
  let selectedProviderId = mutable_source(defaultProvider.id);
  let currentProvider = mutable_source(defaultProvider);
  let availableModels = mutable_source([]);
  let selectedModel = mutable_source("");
  let modelsLoading = mutable_source(false);
  let modelsError = mutable_source(null);
  let loadError = mutable_source(null);
  let saveError = mutable_source(null);
  let saveStatus = mutable_source("idle");
  let newProviderKind = mutable_source((_b = (_a = providerTemplates[0]) == null ? void 0 : _a.kind) != null ? _b : "ollama");
  let newProviderLabel = mutable_source("");
  let newProviderDescription = mutable_source("");
  let newProviderSettings = mutable_source({});
  let createStatus = mutable_source("idle");
  let createError = mutable_source(null);
  let removingProviderId = mutable_source(null);
  let removeStatus = mutable_source("idle");
  let removeError = mutable_source(null);
  let ttsHasApiKey = mutable_source(false);
  let ttsInput = mutable_source("");
  let ttsStatus = mutable_source("idle");
  let ttsError = mutable_source(null);
  let ttsPendingAction = mutable_source(null);
  const loadProviders = async () => {
    var _a2, _b2, _c;
    set(providersLoading, true);
    set(providersError, null);
    try {
      const response = await fetch("/api/providers");
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error((_a2 = data == null ? void 0 : data.error) != null ? _a2 : `Unable to load providers (${response.status})`);
      }
      const list = Array.isArray(data.providers) ? data.providers : [];
      set(providers, list.length ? list : [defaultProvider]);
      if (!get(providers).some((provider) => provider.id === get(selectedProviderId))) {
        set(selectedProviderId, (_c = (_b2 = get(providers)[0]) == null ? void 0 : _b2.id) != null ? _c : defaultProvider.id);
      }
    } catch (error) {
      set(providersError, error instanceof Error ? error.message : "Unable to load providers");
      set(providers, [defaultProvider]);
      set(selectedProviderId, defaultProvider.id);
    } finally {
      set(providersLoading, false);
    }
  };
  const loadSettings = async () => {
    var _a2, _b2, _c, _d, _e;
    set(loadError, null);
    try {
      const response = await fetch("/api/settings");
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error((_a2 = data == null ? void 0 : data.error) != null ? _a2 : `Unable to load settings (${response.status})`);
      }
      const serverSettings = data.settings;
      set(ttsHasApiKey, false);
      if (serverSettings && typeof serverSettings === "object") {
        if (typeof serverSettings.provider === "string") {
          const providerExists = get(providers).some((provider) => provider.id === serverSettings.provider);
          set(selectedProviderId, providerExists ? serverSettings.provider : (_c = (_b2 = get(providers)[0]) == null ? void 0 : _b2.id) != null ? _c : defaultProvider.id);
        }
        if (typeof serverSettings.model === "string") {
          set(selectedModel, serverSettings.model);
        }
        const speechSettings = serverSettings.tts;
        if (speechSettings && typeof speechSettings === "object") {
          set(ttsHasApiKey, Boolean(speechSettings.hasElevenLabsApiKey));
        } else {
          set(ttsHasApiKey, false);
        }
      }
    } catch (error) {
      set(loadError, error instanceof Error ? error.message : "Unable to load saved settings");
      set(selectedProviderId, (_e = (_d = get(providers)[0]) == null ? void 0 : _d.id) != null ? _e : defaultProvider.id);
      set(selectedModel, "");
      set(ttsHasApiKey, false);
    }
  };
  const loadModels = async (provider) => {
    var _a2;
    set(modelsLoading, true);
    set(modelsError, null);
    try {
      const response = await fetch(`/api/models/${provider}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error((_a2 = data == null ? void 0 : data.error) != null ? _a2 : `Unable to load models (${response.status})`);
      }
      set(availableModels, Array.isArray(data.models) ? data.models.filter((name) => typeof name === "string" && name.trim().length > 0) : []);
    } catch (error) {
      set(availableModels, []);
      set(modelsError, error instanceof Error ? error.message : "Unable to load models");
    } finally {
      set(modelsLoading, false);
    }
  };
  const handleProviderChange = async (provider) => {
    var _a2;
    set(selectedProviderId, provider);
    set(selectedModel, "");
    await loadModels(provider);
    set(selectedModel, (_a2 = get(availableModels)[0]) != null ? _a2 : "");
  };
  const handleSave = async () => {
    var _a2;
    if (!get(selectedModel)) {
      set(saveError, "Select a model before saving.");
      return;
    }
    set(saveStatus, "saving");
    set(saveError, null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: get(selectedProviderId),
          model: get(selectedModel)
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error((_a2 = data == null ? void 0 : data.error) != null ? _a2 : `Unable to save settings (${response.status})`);
      }
      set(saveStatus, "saved");
      setTimeout(
        () => {
          set(saveStatus, "idle");
        },
        2e3
      );
    } catch (error) {
      set(saveStatus, "idle");
      set(saveError, error instanceof Error ? error.message : "Unable to save settings");
    }
  };
  const handleTemplateChange = (kind) => {
    set(newProviderKind, kind);
    set(newProviderLabel, "");
    set(newProviderDescription, "");
    set(newProviderSettings, {});
    set(createError, null);
    set(createStatus, "idle");
  };
  const updateNewProviderSetting = (name, value) => {
    set(newProviderSettings, { ...get(newProviderSettings), [name]: value });
  };
  const handleCreateProvider = async () => {
    var _a2, _b2, _c, _d;
    const template = providerTemplates.find((entry) => entry.kind === get(newProviderKind));
    if (!template) {
      set(createError, "Choose a provider type.");
      return;
    }
    set(createStatus, "saving");
    set(createError, null);
    const payloadSettings = {};
    for (const field of template.fields) {
      const value = ((_a2 = get(newProviderSettings)[field.name]) != null ? _a2 : "").trim();
      if (field.required && !value) {
        set(createStatus, "idle");
        set(createError, `${field.label} is required.`);
        return;
      }
      if (value) {
        payloadSettings[field.name] = value;
      }
    }
    try {
      const response = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: get(newProviderKind),
          label: get(newProviderLabel).trim() ? get(newProviderLabel).trim() : void 0,
          description: get(newProviderDescription).trim() ? get(newProviderDescription).trim() : void 0,
          settings: payloadSettings
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error((_b2 = data == null ? void 0 : data.error) != null ? _b2 : `Unable to create provider (${response.status})`);
      }
      const list = Array.isArray(data.providers) ? data.providers : [];
      if (list.length) {
        set(providers, list);
      }
      if ((_c = data == null ? void 0 : data.provider) == null ? void 0 : _c.id) {
        set(selectedProviderId, data.provider.id);
        await loadModels(get(selectedProviderId));
        set(selectedModel, (_d = get(availableModels)[0]) != null ? _d : "");
      }
      set(createStatus, "success");
      set(newProviderLabel, "");
      set(newProviderDescription, "");
      set(newProviderSettings, {});
      setTimeout(
        () => {
          set(createStatus, "idle");
        },
        2e3
      );
    } catch (error) {
      set(createStatus, "idle");
      set(createError, error instanceof Error ? error.message : "Unable to create provider");
    }
  };
  const handleRemoveProvider = async (providerId) => {
    var _a2, _b2, _c, _d;
    if (providerId === defaultProvider.id) {
      return;
    }
    set(removeError, null);
    set(removeStatus, "removing");
    set(removingProviderId, providerId);
    try {
      const response = await fetch(`/api/providers/${encodeURIComponent(providerId)}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error((_a2 = data == null ? void 0 : data.error) != null ? _a2 : `Unable to remove provider (${response.status})`);
      }
      const list = Array.isArray(data.providers) ? data.providers : [];
      set(providers, list.length ? list : [defaultProvider]);
      let shouldReloadModels = false;
      if (!get(providers).some((provider) => provider.id === get(selectedProviderId))) {
        set(selectedProviderId, (_c = (_b2 = get(providers)[0]) == null ? void 0 : _b2.id) != null ? _c : defaultProvider.id);
        shouldReloadModels = true;
      } else if (providerId === get(selectedProviderId)) {
        shouldReloadModels = true;
      }
      if (shouldReloadModels && get(selectedProviderId)) {
        set(selectedModel, "");
        await loadModels(get(selectedProviderId));
        set(selectedModel, (_d = get(availableModels)[0]) != null ? _d : "");
      }
      set(removeStatus, "success");
      setTimeout(
        () => {
          set(removeStatus, "idle");
        },
        2e3
      );
    } catch (error) {
      set(removeStatus, "idle");
      set(removeError, error instanceof Error ? error.message : "Unable to remove provider");
    } finally {
      set(removingProviderId, null);
    }
  };
  const updateTtsKey = async (value, action) => {
    var _a2, _b2;
    if (get(ttsStatus) === "saving") {
      return;
    }
    set(ttsError, null);
    set(ttsStatus, "saving");
    set(ttsPendingAction, action);
    try {
      const response = await fetch("/api/settings/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: value })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error((_a2 = data == null ? void 0 : data.error) != null ? _a2 : `Unable to update ElevenLabs key (${response.status})`);
      }
      const hasKey = Boolean((_b2 = data.settings) == null ? void 0 : _b2.hasElevenLabsApiKey);
      set(ttsHasApiKey, hasKey);
      set(ttsStatus, "success");
      set(ttsInput, "");
      setTimeout(
        () => {
          set(ttsStatus, "idle");
        },
        2e3
      );
    } catch (error) {
      set(ttsStatus, "idle");
      set(ttsError, error instanceof Error ? error.message : "Unable to update ElevenLabs API key");
    } finally {
      set(ttsPendingAction, null);
    }
  };
  const handleSaveTtsKey = () => {
    if (!get(ttsInput).trim()) {
      return;
    }
    void updateTtsKey(get(ttsInput).trim(), "save");
  };
  const handleClearTtsKey = () => {
    if (!get(ttsHasApiKey)) {
      return;
    }
    void updateTtsKey("", "clear");
  };
  onMount(async () => {
    var _a2;
    await loadProviders();
    await loadSettings();
    await loadModels(get(selectedProviderId));
    if (!get(selectedModel) || !get(availableModels).includes(get(selectedModel))) {
      set(selectedModel, (_a2 = get(availableModels)[0]) != null ? _a2 : "");
    }
  });
  let selectedProviderTemplate = mutable_source(null);
  const resolveFieldInputType = (type) => {
    switch (type) {
      case "password":
        return "password";
      case "number":
        return "number";
      case "url":
        return "url";
      default:
        return "text";
    }
  };
  legacy_pre_effect(() => (get(providers), get(selectedProviderId), defaultProvider), () => {
    var _a2, _b2;
    set(currentProvider, (_b2 = (_a2 = get(providers).find((provider) => provider.id === get(selectedProviderId))) != null ? _a2 : get(providers)[0]) != null ? _b2 : defaultProvider);
  });
  legacy_pre_effect(
    () => (get(providersError), get(providers), get(providersLoading)),
    () => {
      var _a2;
      set(computedProvidersError, (_a2 = get(providersError)) != null ? _a2 : get(providers).length === 0 && !get(providersLoading) ? "No providers configured. Create one below to continue." : null);
    }
  );
  legacy_pre_effect(() => get(newProviderKind), () => {
    var _a2, _b2;
    set(selectedProviderTemplate, (_b2 = (_a2 = providerTemplates.find((template) => template.kind === get(newProviderKind))) != null ? _a2 : providerTemplates[0]) != null ? _b2 : null);
  });
  legacy_pre_effect_reset();
  init();
  var main = root();
  var section = child(main);
  var node = sibling(child(section), 4);
  {
    var consequent = ($$anchor2) => {
      var p = root_1();
      var text2 = child(p, true);
      reset(p);
      template_effect(() => set_text(text2, get(loadError)));
      append($$anchor2, p);
    };
    if_block(node, ($$render) => {
      if (get(loadError)) $$render(consequent);
    });
  }
  var form = sibling(node, 2);
  var div = child(form);
  var select = sibling(child(div), 2);
  template_effect(() => {
    get(selectedProviderId);
    invalidate_inner_signals(() => {
      get(providersLoading);
      get(providers);
    });
  });
  each(select, 5, () => get(providers), (option) => option.id, ($$anchor2, option) => {
    var option_1 = root_2();
    var text_1 = child(option_1, true);
    reset(option_1);
    var option_1_value = {};
    template_effect(() => {
      var _a2;
      set_text(text_1, (get(option), untrack(() => get(option).label)));
      if (option_1_value !== (option_1_value = (get(option), untrack(() => get(option).id)))) {
        option_1.value = (_a2 = option_1.__value = (get(option), untrack(() => get(option).id))) != null ? _a2 : "";
      }
    });
    append($$anchor2, option_1);
  });
  reset(select);
  var node_1 = sibling(select, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var p_1 = root_3();
      append($$anchor2, p_1);
    };
    var alternate_1 = ($$anchor2) => {
      var fragment = comment();
      var node_2 = first_child(fragment);
      {
        var consequent_2 = ($$anchor3) => {
          var p_2 = root_5();
          var text_2 = child(p_2, true);
          reset(p_2);
          template_effect(() => set_text(text_2, get(computedProvidersError)));
          append($$anchor3, p_2);
        };
        var alternate = ($$anchor3) => {
          var fragment_1 = comment();
          var node_3 = first_child(fragment_1);
          {
            var consequent_3 = ($$anchor4) => {
              var p_3 = root_7();
              var text_3 = child(p_3, true);
              reset(p_3);
              template_effect(() => set_text(text_3, (get(currentProvider), untrack(() => get(currentProvider).description))));
              append($$anchor4, p_3);
            };
            if_block(
              node_3,
              ($$render) => {
                if (get(currentProvider), untrack(() => {
                  var _a2;
                  return (_a2 = get(currentProvider)) == null ? void 0 : _a2.description;
                })) $$render(consequent_3);
              },
              true
            );
          }
          append($$anchor3, fragment_1);
        };
        if_block(
          node_2,
          ($$render) => {
            if (get(computedProvidersError)) $$render(consequent_2);
            else $$render(alternate, false);
          },
          true
        );
      }
      append($$anchor2, fragment);
    };
    if_block(node_1, ($$render) => {
      if (get(providersLoading)) $$render(consequent_1);
      else $$render(alternate_1, false);
    });
  }
  reset(div);
  var div_1 = sibling(div, 2);
  var select_1 = sibling(child(div_1), 2);
  template_effect(() => {
    get(selectedModel);
    invalidate_inner_signals(() => {
      get(modelsLoading);
      get(availableModels);
    });
  });
  each(select_1, 5, () => get(availableModels), (modelName) => modelName, ($$anchor2, modelName) => {
    var option_2 = root_8();
    var text_4 = child(option_2, true);
    reset(option_2);
    var option_2_value = {};
    template_effect(() => {
      var _a2;
      set_text(text_4, get(modelName));
      if (option_2_value !== (option_2_value = get(modelName))) {
        option_2.value = (_a2 = option_2.__value = get(modelName)) != null ? _a2 : "";
      }
    });
    append($$anchor2, option_2);
  });
  reset(select_1);
  var node_4 = sibling(select_1, 2);
  {
    var consequent_4 = ($$anchor2) => {
      var p_4 = root_9();
      append($$anchor2, p_4);
    };
    var alternate_3 = ($$anchor2) => {
      var fragment_2 = comment();
      var node_5 = first_child(fragment_2);
      {
        var consequent_5 = ($$anchor3) => {
          var p_5 = root_11();
          var text_5 = child(p_5, true);
          reset(p_5);
          template_effect(() => set_text(text_5, get(modelsError)));
          append($$anchor3, p_5);
        };
        var alternate_2 = ($$anchor3) => {
          var fragment_3 = comment();
          var node_6 = first_child(fragment_3);
          {
            var consequent_6 = ($$anchor4) => {
              var p_6 = root_13();
              append($$anchor4, p_6);
            };
            if_block(
              node_6,
              ($$render) => {
                if (get(availableModels), untrack(() => !get(availableModels).length)) $$render(consequent_6);
              },
              true
            );
          }
          append($$anchor3, fragment_3);
        };
        if_block(
          node_5,
          ($$render) => {
            if (get(modelsError)) $$render(consequent_5);
            else $$render(alternate_2, false);
          },
          true
        );
      }
      append($$anchor2, fragment_2);
    };
    if_block(node_4, ($$render) => {
      if (get(modelsLoading)) $$render(consequent_4);
      else $$render(alternate_3, false);
    });
  }
  reset(div_1);
  var node_7 = sibling(div_1, 2);
  {
    var consequent_7 = ($$anchor2) => {
      var p_7 = root_14();
      var text_6 = child(p_7, true);
      reset(p_7);
      template_effect(() => set_text(text_6, get(saveError)));
      append($$anchor2, p_7);
    };
    if_block(node_7, ($$render) => {
      if (get(saveError)) $$render(consequent_7);
    });
  }
  var button = sibling(node_7, 2);
  var node_8 = child(button);
  {
    var consequent_8 = ($$anchor2) => {
      var text_7 = text("Saving…");
      append($$anchor2, text_7);
    };
    var alternate_4 = ($$anchor2) => {
      var text_8 = text("Save Preferences");
      append($$anchor2, text_8);
    };
    if_block(node_8, ($$render) => {
      if (get(saveStatus) === "saving") $$render(consequent_8);
      else $$render(alternate_4, false);
    });
  }
  reset(button);
  var node_9 = sibling(button, 2);
  {
    var consequent_9 = ($$anchor2) => {
      var p_8 = root_17();
      append($$anchor2, p_8);
    };
    if_block(node_9, ($$render) => {
      if (get(saveStatus) === "saved") $$render(consequent_9);
    });
  }
  reset(form);
  reset(section);
  var section_1 = sibling(section, 2);
  var form_1 = sibling(child(section_1), 4);
  var div_2 = child(form_1);
  var input = sibling(child(div_2), 2);
  remove_input_defaults(input);
  var node_10 = sibling(input, 2);
  {
    var consequent_10 = ($$anchor2) => {
      var p_9 = root_18();
      append($$anchor2, p_9);
    };
    var alternate_5 = ($$anchor2) => {
      var p_10 = root_19();
      append($$anchor2, p_10);
    };
    if_block(node_10, ($$render) => {
      if (get(ttsHasApiKey)) $$render(consequent_10);
      else $$render(alternate_5, false);
    });
  }
  reset(div_2);
  var node_11 = sibling(div_2, 2);
  {
    var consequent_11 = ($$anchor2) => {
      var p_11 = root_20();
      var text_9 = child(p_11, true);
      reset(p_11);
      template_effect(() => set_text(text_9, get(ttsError)));
      append($$anchor2, p_11);
    };
    if_block(node_11, ($$render) => {
      if (get(ttsError)) $$render(consequent_11);
    });
  }
  var div_3 = sibling(node_11, 2);
  var button_1 = child(div_3);
  var node_12 = child(button_1);
  {
    var consequent_12 = ($$anchor2) => {
      var text_10 = text("Saving…");
      append($$anchor2, text_10);
    };
    var alternate_6 = ($$anchor2) => {
      var text_11 = text("Save Key");
      append($$anchor2, text_11);
    };
    if_block(node_12, ($$render) => {
      if (get(ttsStatus) === "saving" && get(ttsPendingAction) === "save") $$render(consequent_12);
      else $$render(alternate_6, false);
    });
  }
  reset(button_1);
  var button_2 = sibling(button_1, 2);
  var node_13 = child(button_2);
  {
    var consequent_13 = ($$anchor2) => {
      var text_12 = text("Clearing…");
      append($$anchor2, text_12);
    };
    var alternate_7 = ($$anchor2) => {
      var text_13 = text("Clear Stored Key");
      append($$anchor2, text_13);
    };
    if_block(node_13, ($$render) => {
      if (get(ttsStatus) === "saving" && get(ttsPendingAction) === "clear") $$render(consequent_13);
      else $$render(alternate_7, false);
    });
  }
  reset(button_2);
  reset(div_3);
  var node_14 = sibling(div_3, 2);
  {
    var consequent_14 = ($$anchor2) => {
      var p_12 = root_25();
      append($$anchor2, p_12);
    };
    if_block(node_14, ($$render) => {
      if (get(ttsStatus) === "success") $$render(consequent_14);
    });
  }
  reset(form_1);
  reset(section_1);
  var section_2 = sibling(section_1, 2);
  var form_2 = sibling(child(section_2), 4);
  var div_4 = child(form_2);
  var select_2 = sibling(child(div_4), 2);
  template_effect(() => {
    get(newProviderKind);
    invalidate_inner_signals(() => {
    });
  });
  each(select_2, 5, () => providerTemplates, (template) => template.kind, ($$anchor2, template) => {
    var option_3 = root_26();
    var text_14 = child(option_3, true);
    reset(option_3);
    var option_3_value = {};
    template_effect(() => {
      var _a2;
      set_text(text_14, (get(template), untrack(() => get(template).label)));
      if (option_3_value !== (option_3_value = (get(template), untrack(() => get(template).kind)))) {
        option_3.value = (_a2 = option_3.__value = (get(template), untrack(() => get(template).kind))) != null ? _a2 : "";
      }
    });
    append($$anchor2, option_3);
  });
  reset(select_2);
  reset(div_4);
  var div_5 = sibling(div_4, 2);
  var input_1 = sibling(child(div_5), 2);
  remove_input_defaults(input_1);
  reset(div_5);
  var div_6 = sibling(div_5, 2);
  var input_2 = sibling(child(div_6), 2);
  remove_input_defaults(input_2);
  reset(div_6);
  var node_15 = sibling(div_6, 2);
  {
    var consequent_16 = ($$anchor2) => {
      var fragment_4 = comment();
      var node_16 = first_child(fragment_4);
      each(
        node_16,
        1,
        () => (get(selectedProviderTemplate), untrack(() => get(selectedProviderTemplate).fields)),
        (field) => field.name,
        ($$anchor3, field) => {
          var div_7 = root_28();
          var label = child(div_7);
          var text_15 = child(label, true);
          reset(label);
          var input_3 = sibling(label, 2);
          remove_input_defaults(input_3);
          var node_17 = sibling(input_3, 2);
          {
            var consequent_15 = ($$anchor4) => {
              var p_13 = root_29();
              var text_16 = child(p_13, true);
              reset(p_13);
              template_effect(() => set_text(text_16, (get(field), untrack(() => get(field).helperText))));
              append($$anchor4, p_13);
            };
            if_block(node_17, ($$render) => {
              if (get(field), untrack(() => get(field).helperText)) $$render(consequent_15);
            });
          }
          reset(div_7);
          template_effect(
            ($0) => {
              set_attribute(label, "for", (get(field), untrack(() => `provider-field-${get(field).name}`)));
              set_text(text_15, (get(field), untrack(() => get(field).label)));
              set_attribute(input_3, "id", (get(field), untrack(() => `provider-field-${get(field).name}`)));
              set_attribute(input_3, "type", $0);
              set_attribute(input_3, "placeholder", (get(field), untrack(() => get(field).placeholder)));
              set_value(input_3, (get(newProviderSettings), get(field), untrack(() => {
                var _a2;
                return (_a2 = get(newProviderSettings)[get(field).name]) != null ? _a2 : "";
              })));
            },
            [
              () => (get(field), untrack(() => resolveFieldInputType(get(field).type)))
            ]
          );
          event("input", input_3, (event2) => updateNewProviderSetting(get(field).name, event2.currentTarget.value));
          append($$anchor3, div_7);
        }
      );
      append($$anchor2, fragment_4);
    };
    if_block(node_15, ($$render) => {
      if (get(selectedProviderTemplate)) $$render(consequent_16);
    });
  }
  var node_18 = sibling(node_15, 2);
  {
    var consequent_17 = ($$anchor2) => {
      var p_14 = root_30();
      var text_17 = child(p_14, true);
      reset(p_14);
      template_effect(() => set_text(text_17, get(createError)));
      append($$anchor2, p_14);
    };
    if_block(node_18, ($$render) => {
      if (get(createError)) $$render(consequent_17);
    });
  }
  var button_3 = sibling(node_18, 2);
  var node_19 = child(button_3);
  {
    var consequent_18 = ($$anchor2) => {
      var text_18 = text("Adding…");
      append($$anchor2, text_18);
    };
    var alternate_8 = ($$anchor2) => {
      var text_19 = text("Add Provider");
      append($$anchor2, text_19);
    };
    if_block(node_19, ($$render) => {
      if (get(createStatus) === "saving") $$render(consequent_18);
      else $$render(alternate_8, false);
    });
  }
  reset(button_3);
  var node_20 = sibling(button_3, 2);
  {
    var consequent_19 = ($$anchor2) => {
      var p_15 = root_33();
      append($$anchor2, p_15);
    };
    if_block(node_20, ($$render) => {
      if (get(createStatus) === "success") $$render(consequent_19);
    });
  }
  reset(form_2);
  reset(section_2);
  var section_3 = sibling(section_2, 2);
  var node_21 = sibling(child(section_3), 4);
  {
    var consequent_20 = ($$anchor2) => {
      var p_16 = root_34();
      var text_20 = child(p_16, true);
      reset(p_16);
      template_effect(() => set_text(text_20, get(removeError)));
      append($$anchor2, p_16);
    };
    var alternate_9 = ($$anchor2) => {
      var fragment_5 = comment();
      var node_22 = first_child(fragment_5);
      {
        var consequent_21 = ($$anchor3) => {
          var p_17 = root_36();
          append($$anchor3, p_17);
        };
        if_block(
          node_22,
          ($$render) => {
            if (get(removeStatus) === "success") $$render(consequent_21);
          },
          true
        );
      }
      append($$anchor2, fragment_5);
    };
    if_block(node_21, ($$render) => {
      if (get(removeError)) $$render(consequent_20);
      else $$render(alternate_9, false);
    });
  }
  var ul = sibling(node_21, 2);
  each(ul, 5, () => get(providers), (provider) => provider.id, ($$anchor2, provider) => {
    var li = root_37();
    var div_8 = child(li);
    var span = child(div_8);
    var text_21 = child(span, true);
    reset(span);
    var span_1 = sibling(span, 2);
    var text_22 = child(span_1, true);
    reset(span_1);
    reset(div_8);
    var node_23 = sibling(div_8, 2);
    {
      var consequent_22 = ($$anchor3) => {
        var p_18 = root_38();
        var text_23 = child(p_18, true);
        reset(p_18);
        template_effect(() => set_text(text_23, (get(provider), untrack(() => get(provider).description))));
        append($$anchor3, p_18);
      };
      if_block(node_23, ($$render) => {
        if (get(provider), untrack(() => get(provider).description)) $$render(consequent_22);
      });
    }
    var node_24 = sibling(node_23, 2);
    {
      var consequent_23 = ($$anchor3) => {
        var dl = root_39();
        each(
          dl,
          5,
          () => (get(provider), untrack(() => Object.entries(get(provider).settings))),
          ([key, value]) => key,
          ($$anchor4, $$item) => {
            var $$array = user_derived(() => to_array(get($$item), 2));
            let key = () => get($$array)[0];
            let value = () => get($$array)[1];
            var div_9 = root_40();
            var dt = child(div_9);
            var text_24 = child(dt, true);
            reset(dt);
            var dd = sibling(dt, 2);
            var text_25 = child(dd, true);
            reset(dd);
            reset(div_9);
            template_effect(() => {
              set_text(text_24, key());
              set_text(text_25, value());
            });
            append($$anchor4, div_9);
          }
        );
        reset(dl);
        append($$anchor3, dl);
      };
      var alternate_10 = ($$anchor3) => {
        var p_19 = root_41();
        append($$anchor3, p_19);
      };
      if_block(node_24, ($$render) => {
        if (get(provider), untrack(() => {
          var _a2;
          return Object.keys((_a2 = get(provider).settings) != null ? _a2 : {}).length;
        })) $$render(consequent_23);
        else $$render(alternate_10, false);
      });
    }
    var div_10 = sibling(node_24, 2);
    var node_25 = child(div_10);
    {
      var consequent_24 = ($$anchor3) => {
        var span_2 = root_42();
        append($$anchor3, span_2);
      };
      var alternate_11 = ($$anchor3) => {
        var button_4 = root_43();
        var text_26 = child(button_4, true);
        reset(button_4);
        template_effect(() => {
          button_4.disabled = get(removeStatus) === "removing";
          set_text(text_26, (get(removingProviderId), get(provider), untrack(() => get(removingProviderId) === get(provider).id ? "Removing…" : "Remove")));
        });
        event("click", button_4, () => handleRemoveProvider(get(provider).id));
        append($$anchor3, button_4);
      };
      if_block(node_25, ($$render) => {
        if (get(provider), deep_read_state(defaultProvider), untrack(() => get(provider).id === defaultProvider.id)) $$render(consequent_24);
        else $$render(alternate_11, false);
      });
    }
    reset(div_10);
    reset(li);
    template_effect(() => {
      set_text(text_21, (get(provider), untrack(() => get(provider).label)));
      set_text(text_22, (get(provider), untrack(() => get(provider).kind)));
    });
    append($$anchor2, li);
  });
  reset(ul);
  reset(section_3);
  reset(main);
  template_effect(
    ($0) => {
      set_attribute(main, "data-variant", variant());
      select.disabled = (get(providersLoading), get(providers), untrack(() => get(providersLoading) || !get(providers).length));
      select_1.disabled = (get(modelsLoading), get(availableModels), untrack(() => get(modelsLoading) || !get(availableModels).length));
      button.disabled = get(saveStatus) === "saving" || get(modelsLoading) || get(providersLoading);
      set_attribute(input, "placeholder", get(ttsHasApiKey) ? "Key stored. Enter a new key to replace it." : "sk_...");
      button_1.disabled = $0;
      button_2.disabled = get(ttsStatus) === "saving" || !get(ttsHasApiKey);
      button_3.disabled = get(createStatus) === "saving";
    },
    [
      () => (get(ttsStatus), get(ttsInput), untrack(() => get(ttsStatus) === "saving" || !get(ttsInput).trim()))
    ]
  );
  bind_select_value(select, () => get(selectedProviderId), ($$value) => set(selectedProviderId, $$value));
  event("change", select, () => handleProviderChange(get(selectedProviderId)));
  bind_select_value(select_1, () => get(selectedModel), ($$value) => set(selectedModel, $$value));
  event("submit", form, preventDefault(handleSave));
  bind_value(input, () => get(ttsInput), ($$value) => set(ttsInput, $$value));
  event("click", button_2, handleClearTtsKey);
  event("submit", form_1, preventDefault(handleSaveTtsKey));
  bind_select_value(select_2, () => get(newProviderKind), ($$value) => set(newProviderKind, $$value));
  event("change", select_2, (event2) => handleTemplateChange(event2.currentTarget.value));
  bind_value(input_1, () => get(newProviderLabel), ($$value) => set(newProviderLabel, $$value));
  bind_value(input_2, () => get(newProviderDescription), ($$value) => set(newProviderDescription, $$value));
  event("submit", form_2, preventDefault(handleCreateProvider));
  append($$anchor, main);
  pop();
}
export {
  LlmSettingsPanel as L,
  bind_value as b,
  defaultProvider as d,
  preventDefault as p,
  stopPropagation as s
};
//# sourceMappingURL=nVpKcSPn.js.map
