'use client';

import React from 'react';
import { useSettings } from '@/lib/contexts/SettingsContext';

export const EditorSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  return (
    <div className="vf-settings-section">
      <div className="vf-settings-section-header">
        <h2 className="vf-settings-section-title">Editor</h2>
        <p className="vf-settings-section-description">
          Configure code editor behavior and appearance
        </p>
      </div>

      <div className="vf-settings-section-content">
        <div className="vf-settings-group">
          <h3 className="vf-settings-group-title">Editor Appearance</h3>
          <div className="vf-settings-group-content">
            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Editor Theme</label>
                <span className="vf-settings-field-description">
                  Monaco editor color theme
                </span>
              </div>
              <div className="vf-settings-field-control">
                <select
                  value={settings.editorTheme}
                  onChange={(e) => updateSettings({ editorTheme: e.target.value })}
                  className="vf-settings-select"
                >
                  <option value="vs-dark">VS Dark</option>
                  <option value="vs-light">VS Light</option>
                  <option value="hc-black">High Contrast Dark</option>
                  <option value="hc-light">High Contrast Light</option>
                </select>
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Show Line Numbers</label>
                <span className="vf-settings-field-description">
                  Display line numbers in the editor
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="checkbox"
                  checked={settings.lineNumbers}
                  onChange={(e) => updateSettings({ lineNumbers: e.target.checked })}
                  className="vf-settings-checkbox"
                />
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Show Minimap</label>
                <span className="vf-settings-field-description">
                  Display code minimap for quick navigation
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="checkbox"
                  checked={settings.minimap}
                  onChange={(e) => updateSettings({ minimap: e.target.checked })}
                  className="vf-settings-checkbox"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="vf-settings-group">
          <h3 className="vf-settings-group-title">Editor Behavior</h3>
          <div className="vf-settings-group-content">
            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Tab Size</label>
                <span className="vf-settings-field-description">
                  Number of spaces per tab
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="number"
                  value={settings.tabSize}
                  onChange={(e) => updateSettings({ tabSize: parseInt(e.target.value) })}
                  min="2"
                  max="8"
                  className="vf-settings-input"
                  style={{ width: '80px' }}
                />
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Word Wrap</label>
                <span className="vf-settings-field-description">
                  Wrap long lines automatically
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="checkbox"
                  checked={settings.wordWrap}
                  onChange={(e) => updateSettings({ wordWrap: e.target.checked })}
                  className="vf-settings-checkbox"
                />
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Auto Save</label>
                <span className="vf-settings-field-description">
                  Automatically save files on change
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="checkbox"
                  checked={settings.autoSave}
                  onChange={(e) => updateSettings({ autoSave: e.target.checked })}
                  className="vf-settings-checkbox"
                />
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Format On Save</label>
                <span className="vf-settings-field-description">
                  Automatically format code when saving
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="checkbox"
                  checked={settings.formatOnSave}
                  onChange={(e) => updateSettings({ formatOnSave: e.target.checked })}
                  className="vf-settings-checkbox"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
