import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type ThemeId = 'stormhacks' | 'sfu';

export interface ThemeOption {
    id: ThemeId;
    label: string;
    description?: string;
    accent?: string;
}

export const THEME_STORAGE_KEY = 'stormhacks.selectedTheme';
export const DEFAULT_THEME_ID: ThemeId = 'stormhacks';

const THEME_OPTIONS: ThemeOption[] = [
    {
        id: 'stormhacks',
        label: 'StormHacks Night',
        description: 'Deep indigos with neon primaries – the current default look.',
        accent: '#4b5cff'
    },
    {
        id: 'sfu',
        label: 'SFU Classic',
        description: 'SFU red with warm gold accents and high contrast neutrals.',
        accent: '#cc0000'
    }
];

const isValidThemeId = (value: string | null): value is ThemeId =>
    THEME_OPTIONS.some((theme) => theme.id === value);

const applyTheme = (value: ThemeId) => {
    if (!browser) return;
    document.documentElement.dataset.theme = value;
};

const themeStore = writable<ThemeId>(DEFAULT_THEME_ID);

if (browser) {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const initial = isValidThemeId(stored) ? stored : DEFAULT_THEME_ID;

    if (initial !== DEFAULT_THEME_ID) {
        themeStore.set(initial);
    }
    applyTheme(initial);

    themeStore.subscribe((value) => {
        applyTheme(value);
        localStorage.setItem(THEME_STORAGE_KEY, value);
    });
}

export const theme = {
    subscribe: themeStore.subscribe,
    set: themeStore.set
};

export const availableThemes = THEME_OPTIONS;
