/** Named `localStorage` keys — single source of truth so a typo can't silently
 * create an orphaned duplicate key. */
export const STORAGE_KEYS = {
  theme: 'sfda_theme',
  aiProvider: 'sfda_ai_provider',
  aiBaseUrl: 'sfda_ai_baseurl',
  aiFormat: 'sfda_ai_format',
  aiKeyFor: (providerId: string) => `sfda_ai_key_${providerId}`,
  aiModelFor: (providerId: string) => `sfda_ai_model_${providerId}`,
  openRouterModelsCache: 'sfda_openrouter_models_v2',
} as const;
