// Shared window.api type declaration for all renderer pages

declare global {
  interface Window {
    api: {
      getSettings: () => Promise<Record<string, unknown>>;
      saveSettings: (partial: Record<string, unknown>) => Promise<boolean>;

      // Outlook Calendar — ICS URL or local file (no OAuth, no admin consent)
      testIcsUrl: (url: string) => Promise<{ ok: boolean; eventCount: number; error?: string }>;
      saveIcsUrl: (url: string) => Promise<boolean>;
      openIcsFileDialog: () => Promise<{ ok: boolean; eventCount: number; error?: string; filePath?: string } | null>;
      saveIcsFilePath: (path: string) => Promise<boolean>;
      saveLeaveDates: (dates: Array<{ from: string; to: string; label: string }>) => Promise<boolean>;

      // Monday.com — OAuth
      mondayOAuthStart: () => Promise<{ ok: boolean; name?: string; error?: string }>;

      // Monday.com Data
      fetchBoards: () => Promise<{ id: string; name: string }[]>;
      saveBoardOverride: (key: string, boardId: string, remember: boolean) => Promise<boolean>;
      saveRowSelection: (name: string) => Promise<boolean>;

      // Engine
      runCheck: () => Promise<void>;

      // Window controls
      closeSettings: () => Promise<void>;
      closeWizard: () => Promise<void>;
      closeBoardPicker: (boardId: string, remember: boolean, expectedName: string) => Promise<void>;
      closeRowPicker: (name: string) => Promise<void>;

      // Listeners
      onInitData: (cb: (data: unknown) => void) => void;
    };
  }
}

export {};
