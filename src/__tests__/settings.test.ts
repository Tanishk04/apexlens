import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  ENTRY_CACHE_KEY,
  SUSPEND_KEY,
  readSettings,
  writeSettings,
  readSuspendState,
  writeSuspendState,
} from '../settings';

/** Minimal chrome.storage.local stand-in, with a hook to force failures. */
function mockStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  const store = {
    shouldThrow: false,
    get data() {
      return data;
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (key: string) => {
          if (store.shouldThrow) throw new Error('storage unavailable');
          return key in data ? { [key]: data[key] } : {};
        },
        set: async (patch: Record<string, unknown>) => {
          if (store.shouldThrow) throw new Error('storage unavailable');
          Object.assign(data, patch);
        },
      },
    },
  };
  return store;
}

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    mockStorage();
    await expect(readSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('defaults the entry columns on — the feature is the point of installing it', () => {
    expect(DEFAULT_SETTINGS.entryColumns).toBe(true);
    expect(DEFAULT_SETTINGS.autoResolve).toBe(true);
    expect(DEFAULT_SETTINGS.respectSaveData).toBe(true);
  });

  it('round-trips a patch without disturbing the other keys', async () => {
    mockStorage();
    await writeSettings({ autoResolve: false });
    await expect(readSettings()).resolves.toEqual({
      ...DEFAULT_SETTINGS,
      autoResolve: false,
    });
  });

  it('fills in keys missing from a settings object written by an older version', async () => {
    // The failure this guards: a key added after the user last saved would read
    // as undefined and, being falsy, silently disable a feature they never
    // turned off.
    mockStorage({ [SETTINGS_KEY]: { entryColumns: false } });
    await expect(readSettings()).resolves.toEqual({
      entryColumns: false,
      autoResolve: true,
      respectSaveData: true,
    });
  });

  it('falls back to defaults rather than throwing when storage is unavailable', async () => {
    const store = mockStorage();
    store.shouldThrow = true;
    await expect(readSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('keeps settings and the entry cache under separate keys', async () => {
    // Clearing a large cache must never reset the user's preferences.
    const store = mockStorage({ [ENTRY_CACHE_KEY]: { '07L1': {} } });
    await writeSettings({ entryColumns: false });
    expect(store.data[ENTRY_CACHE_KEY]).toBeDefined();
    expect(store.data[SETTINGS_KEY]).toBeDefined();
    expect(SETTINGS_KEY).not.toBe(ENTRY_CACHE_KEY);
  });
});

describe('suspend state', () => {
  it('reports not suspended when nothing is stored', async () => {
    mockStorage();
    await expect(readSuspendState()).resolves.toEqual({ suspended: false, averageBytes: 0 });
  });

  it('round-trips the observed figure that justified suspending', async () => {
    const store = mockStorage();
    await writeSuspendState({ suspended: true, averageBytes: 3_000_000 });
    expect(store.data[SUSPEND_KEY]).toEqual({ suspended: true, averageBytes: 3_000_000 });
    await expect(readSuspendState()).resolves.toEqual({
      suspended: true,
      averageBytes: 3_000_000,
    });
  });

  it('does not throw when storage rejects the write', async () => {
    const store = mockStorage();
    store.shouldThrow = true;
    await expect(writeSuspendState({ suspended: true, averageBytes: 1 })).resolves.toBeUndefined();
  });
});
