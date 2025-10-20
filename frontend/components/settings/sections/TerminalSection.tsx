'use client';

import React from 'react';
import { useSettings } from '@/lib/contexts/SettingsContext';

export const TerminalSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  return (
    <div className="vf-settings-section">
      <div className="vf-settings-section-header">
        <h2 className="vf-settings-section-title">Terminal</h2>
        <p className="vf-settings-section-description">
          Configure integrated terminal appearance and behavior
        </p>
      </div>

      <div className="vf-settings-section-content">
        <div className="vf-settings-group">
          <h3 className="vf-settings-group-title">Terminal Appearance</h3>
          <div className="vf-settings-group-content">
            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Font Size</label>
                <span className="vf-settings-field-description">
                  Terminal font size (10-24px)
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="number"
                  value={settings.terminalFontSize}
                  onChange={(e) => updateSettings({ terminalFontSize: parseInt(e.target.value) })}
                  min="10"
                  max="24"
                  className="vf-settings-input"
                  style={{ width: '80px' }}
                />
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Cursor Style</label>
                <span className="vf-settings-field-description">
                  Terminal cursor appearance
                </span>
              </div>
              <div className="vf-settings-field-control">
                <select
                  value={settings.terminalCursorStyle}
                  onChange={(e) => updateSettings({ terminalCursorStyle: e.target.value as any })}
                  className="vf-settings-select"
                >
                  <option value="block">Block</option>
                  <option value="line">Line</option>
                  <option value="underline">Underline</option>
                </select>
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Cursor Blink</label>
                <span className="vf-settings-field-description">
                  Enable blinking cursor in terminal
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="checkbox"
                  checked={settings.terminalCursorBlink}
                  onChange={(e) => updateSettings({ terminalCursorBlink: e.target.checked })}
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
