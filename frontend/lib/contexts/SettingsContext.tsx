'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@clerk/nextjs';
import { api } from '@/lib/api';

export interface UserSettings {
  // Theme
  theme: 'dark' | 'light' | 'auto';
  primaryColor: string;
  fontSize: number;
  fontFamily: string;

  // Editor
  editorTheme: string;
  tabSize: number;
  autoSave: boolean;
  formatOnSave: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  wordWrap: boolean;

  // Agentic Code Engine
  aiModel: string;
  aiTemperature: number;
  aiMaxTokens: number;
  aiAutoComplete: boolean;
  aiProvider?: string;
  aiApiKey?: string;
  aiOAuthToken?: string;
  aiBaseUrl?: string;
  aiCustomModelId?: string;
  aiContextWindow?: number;
  aiEnablePromptCaching?: boolean;
  aiEnableStreaming?: boolean;
  aiAutoApproveEdits?: boolean;
  aiEnableDiffStrategy?: boolean;
  aiConsecutiveErrorLimit?: number;
  aiRateLimit?: number;
  aiMaxRequests?: number;

  // Terminal
  terminalFontSize: number;
  terminalCursorStyle: 'block' | 'line' | 'underline';
  terminalCursorBlink: boolean;

  // Performance
  maxFileSize: number;
  enableCache: boolean;
  preloadFiles: boolean;
}

const defaultSettings: UserSettings = {
  theme: 'dark',
  primaryColor: '#CAC4B7',
  fontSize: 14,
  fontFamily: 'Inter',

  editorTheme: 'vs-dark',
  tabSize: 2,
  autoSave: true,
  formatOnSave: true,
  minimap: true,
  lineNumbers: true,
  wordWrap: false,

  aiModel: 'claude-3-5-sonnet-20241022',
  aiTemperature: 0.7,
  aiMaxTokens: 8192,
  aiAutoComplete: true,
  aiProvider: 'anthropic',
  aiApiKey: '',
  aiBaseUrl: '',
  aiCustomModelId: '',
  aiContextWindow: 200000,
  aiEnablePromptCaching: true,
  aiEnableStreaming: true,
  aiAutoApproveEdits: false,
  aiEnableDiffStrategy: true,
  aiConsecutiveErrorLimit: 3,
  aiRateLimit: 0,
  aiMaxRequests: 0,

  terminalFontSize: 14,
  terminalCursorStyle: 'block',
  terminalCursorBlink: true,

  maxFileSize: 10,
  enableCache: true,
  preloadFiles: true,
};

interface SettingsContextType {
  settings: UserSettings;
  updateSettings: (updates: Partial<UserSettings>) => void;
  saveSettings: () => Promise<void>;
  resetSettings: () => void;
  hasUnsavedChanges: boolean;
  isLoading: boolean;
  error: string | null;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [savedSettings, setSavedSettings] = useState<UserSettings>(defaultSettings);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Set up API token getter IMMEDIATELY - before any components try to use it
  useEffect(() => {
    if (getToken) {
      api.setTokenGetter(getToken);
    }
  }, [getToken]);

  // Load settings on mount
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      loadSettings();
    }
  }, [isLoaded, isSignedIn]);

  // Check for unsaved changes
  useEffect(() => {
    const hasChanges = JSON.stringify(settings) !== JSON.stringify(savedSettings);
    setHasUnsavedChanges(hasChanges);
  }, [settings, savedSettings]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);

      // Try to load from backend API
      try {
        const response = await api.getUserSettings();
        if (response.settings) {
          setSettings(response.settings);
          setSavedSettings(response.settings);
          // Save non-sensitive settings to localStorage as backup
          const { aiApiKey, aiOAuthToken, ...nonSensitiveSettings } = response.settings;
          localStorage.setItem('vaporform_settings', JSON.stringify(nonSensitiveSettings));
          return;
        }
      } catch (apiErr: any) {
        console.warn('Failed to load settings from API, trying localStorage:', apiErr);
      }

      // Fallback to localStorage if API fails (won't include sensitive fields)
      const stored = localStorage.getItem('vaporform_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...defaultSettings, ...parsed });
        setSavedSettings({ ...defaultSettings, ...parsed });
      }
    } catch (err: any) {
      console.error('Failed to load settings:', err);
      setError('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = (updates: Partial<UserSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const saveSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Save non-sensitive settings to localStorage as backup
      const { aiApiKey, aiOAuthToken, ...nonSensitiveSettings } = settings;
      localStorage.setItem('vaporform_settings', JSON.stringify(nonSensitiveSettings));

      // Prepare settings for backend - only include sensitive fields if they have actual values
      // This prevents accidentally deleting keys from backend when they're not in localStorage
      const settingsToSend = { ...settings };
      if (!aiApiKey || aiApiKey.trim().length === 0) {
        delete settingsToSend.aiApiKey;
      }
      if (!aiOAuthToken || aiOAuthToken.trim().length === 0) {
        delete settingsToSend.aiOAuthToken;
      }

      // Save to backend API
      try {
        const response = await api.updateUserSettings(settingsToSend);
        if (response.settings) {
          setSavedSettings(response.settings);
        } else {
          setSavedSettings(settings);
        }
      } catch (apiErr: any) {
        console.error('Failed to save settings to API:', apiErr);

        // Parse error message from backend
        let errorMessage = 'Failed to save settings to server.';

        if (apiErr.message) {
          errorMessage = apiErr.message;
        } else if (typeof apiErr === 'string') {
          errorMessage = apiErr;
        } else if (apiErr.error) {
          errorMessage = apiErr.error;
        }

        // Check for network errors
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
          errorMessage = 'Unable to connect to server. Please check your connection and try again.';
        }

        setError(errorMessage);
        // Still mark as saved locally
        setSavedSettings(settings);
        throw new Error(errorMessage);
      }

      setHasUnsavedChanges(false);
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      if (!error) {
        setError('Failed to save settings. Please try again.');
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const resetSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Reset in backend
      try {
        const response = await api.resetUserSettings();
        if (response.settings) {
          setSettings(response.settings);
          setSavedSettings(response.settings);
          localStorage.setItem('vaporform_settings', JSON.stringify(response.settings));
        } else {
          setSettings(defaultSettings);
          setSavedSettings(defaultSettings);
          localStorage.removeItem('vaporform_settings');
        }
      } catch (apiErr: any) {
        console.error('Failed to reset settings in API:', apiErr);
        // Reset locally anyway
        setSettings(defaultSettings);
        setSavedSettings(defaultSettings);
        localStorage.removeItem('vaporform_settings');
      }

      setHasUnsavedChanges(false);
    } catch (err: any) {
      console.error('Failed to reset settings:', err);
      setError('Failed to reset settings');
    } finally {
      setIsLoading(false);
    }
  };

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        saveSettings,
        resetSettings,
        hasUnsavedChanges,
        isLoading,
        error,
        isModalOpen,
        openModal,
        closeModal,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
