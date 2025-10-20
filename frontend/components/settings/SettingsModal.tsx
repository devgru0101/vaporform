'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '@/lib/contexts/SettingsContext';
import { ThemeSection } from './sections/ThemeSection';
import { EditorSection } from './sections/EditorSection';
import { AiSection } from './sections/AiSection';
import { TerminalSection } from './sections/TerminalSection';
import './SettingsModal.css';

type SettingsCategory = 'theme' | 'editor' | 'ai' | 'terminal';

interface SettingsCategoryInfo {
  id: SettingsCategory;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const SETTINGS_CATEGORIES: SettingsCategoryInfo[] = [
  {
    id: 'theme',
    label: 'Appearance',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/>
      </svg>
    ),
    description: 'Theme and visual customization'
  },
  {
    id: 'editor',
    label: 'Editor',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    description: 'Code editor settings and preferences'
  },
  {
    id: 'ai',
    label: 'Agentic Code Engine',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    ),
    description: 'Agentic code engine configuration'
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="4 17 10 11 4 5"/>
        <line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
    description: 'Terminal preferences and behavior'
  }
];

export const SettingsModal: React.FC = () => {
  const {
    settings,
    saveSettings,
    resetSettings,
    hasUnsavedChanges,
    isLoading,
    error,
    isModalOpen,
    closeModal,
  } = useSettings();

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('theme');
  const [searchQuery, setSearchQuery] = useState('');

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isModalOpen) {
        handleClose();
      }
    };

    if (isModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isModalOpen]);

  // Filter categories based on search query
  const filteredCategories = SETTINGS_CATEGORIES.filter(category =>
    category.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    category.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmClose = window.confirm(
        'You have unsaved changes. Are you sure you want to close without saving?'
      );
      if (!confirmClose) return;
    }
    closeModal();
  }, [hasUnsavedChanges, closeModal]);

  const handleSave = useCallback(async () => {
    try {
      await saveSettings();
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, [saveSettings]);

  const handleReset = useCallback(() => {
    const confirmReset = window.confirm(
      'This will reset all settings to their default values. Are you sure you want to continue?'
    );
    if (confirmReset) {
      resetSettings();
    }
  }, [resetSettings]);

  const handleBackdropClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  const renderSettingsContent = () => {
    switch (activeCategory) {
      case 'theme':
        return <ThemeSection />;
      case 'editor':
        return <EditorSection />;
      case 'ai':
        return <AiSection />;
      case 'terminal':
        return <TerminalSection />;
      default:
        return <div className="vf-settings-error">Category not found</div>;
    }
  };

  if (!isModalOpen) return null;

  return (
    <div className="vf-settings-overlay" onClick={handleBackdropClick}>
      <div className="vf-settings-modal" role="dialog" aria-labelledby="settings-title" aria-modal="true">
        {/* Header */}
        <div className="vf-settings-header">
          <div className="vf-settings-title-section">
            <h1 id="settings-title" className="vf-settings-title">
              SETTINGS
            </h1>
            <p className="vf-settings-subtitle">
              Configure your Vaporform experience
            </p>
          </div>

          <div className="vf-settings-header-actions">
            {hasUnsavedChanges && (
              <span className="vf-settings-unsaved-indicator">
                UNSAVED CHANGES
              </span>
            )}
            <button
              onClick={handleClose}
              aria-label="Close settings"
              className="vf-settings-close-btn"
              style={{
                background: 'transparent',
                border: '1px solid var(--vf-border-primary)',
                color: 'var(--vf-text-muted)',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                transition: 'all var(--vf-transition-fast)'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="vf-settings-content">
          {/* Sidebar */}
          <div className="vf-settings-sidebar">
            <div className="vf-settings-search">
              <input
                type="text"
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="vf-settings-search-input"
                aria-label="Search settings"
              />
            </div>

            <nav className="vf-settings-nav" role="navigation" aria-label="Settings categories">
              {filteredCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`vf-settings-nav-item ${
                    activeCategory === category.id ? 'active' : ''
                  }`}
                  aria-current={activeCategory === category.id ? 'page' : undefined}
                >
                  <span className="vf-settings-nav-icon">
                    {category.icon}
                  </span>
                  <div className="vf-settings-nav-content">
                    <span className="vf-settings-nav-label">{category.label}</span>
                    <span className="vf-settings-nav-description">{category.description}</span>
                  </div>
                </button>
              ))}
            </nav>
          </div>

          {/* Main Content */}
          <div className="vf-settings-main">
            <div className="vf-settings-section-content">
              {error && (
                <div className="vf-settings-error-banner">
                  <span className="vf-settings-error-text">{error}</span>
                  <button
                    onClick={() => {}}
                    className="vf-settings-error-close"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--vf-accent-danger)',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              {renderSettingsContent()}
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div style={{
            padding: 'var(--vf-space-4)',
            background: '#dc2626',
            borderTop: '2px solid #b91c1c',
            borderBottom: '2px solid #b91c1c',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--vf-space-3)'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{
              color: '#ffffff',
              fontSize: 'var(--vf-text-sm)',
              fontWeight: 500
            }}>
              {error}
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="vf-settings-footer">
          <div className="vf-settings-footer-info">
            <span className="vf-settings-last-saved">
              Vaporform AI-Powered IDE
            </span>
          </div>

          <div className="vf-settings-footer-actions">
            <button
              onClick={handleReset}
              disabled={isLoading}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--vf-border-primary)',
                color: 'var(--vf-text-secondary)',
                fontFamily: 'var(--vf-font-display)',
                fontSize: 'var(--vf-text-xs)',
                fontWeight: 'var(--vf-weight-bold)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
                transition: 'all var(--vf-transition-fast)'
              }}
            >
              RESET TO DEFAULTS
            </button>

            <button
              onClick={handleClose}
              disabled={isLoading}
              style={{
                padding: '8px 16px',
                background: 'var(--vf-bg-tertiary)',
                border: '1px solid var(--vf-border-primary)',
                color: 'var(--vf-text-primary)',
                fontFamily: 'var(--vf-font-display)',
                fontSize: 'var(--vf-text-xs)',
                fontWeight: 'var(--vf-weight-bold)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
                transition: 'all var(--vf-transition-fast)'
              }}
            >
              CANCEL
            </button>

            <button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isLoading}
              style={{
                padding: '8px 16px',
                background: hasUnsavedChanges ? 'var(--vf-accent-primary)' : 'var(--vf-bg-tertiary)',
                border: `1px solid ${hasUnsavedChanges ? 'var(--vf-accent-primary)' : 'var(--vf-border-primary)'}`,
                color: hasUnsavedChanges ? 'var(--vf-bg-primary)' : 'var(--vf-text-muted)',
                fontFamily: 'var(--vf-font-display)',
                fontSize: 'var(--vf-text-xs)',
                fontWeight: 'var(--vf-weight-bold)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: (!hasUnsavedChanges || isLoading) ? 'not-allowed' : 'pointer',
                opacity: (!hasUnsavedChanges || isLoading) ? 0.5 : 1,
                transition: 'all var(--vf-transition-fast)'
              }}
            >
              {isLoading ? 'SAVING...' : 'SAVE CHANGES'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
