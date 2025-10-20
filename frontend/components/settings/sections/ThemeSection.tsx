'use client';

import React from 'react';
import { useSettings } from '@/lib/contexts/SettingsContext';

export const ThemeSection: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  const predefinedColors = [
    { name: 'Brutalist Tan', value: '#CAC4B7' },
    { name: 'Neon Green', value: '#E1FF00' },
    { name: 'Electric Blue', value: '#2B00FF' },
    { name: 'Warning Orange', value: '#FF4200' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Teal', value: '#14B8A6' },
  ];

  return (
    <div className="vf-settings-section">
      <div className="vf-settings-section-header">
        <h2 className="vf-settings-section-title">Appearance</h2>
        <p className="vf-settings-section-description">
          Customize the visual appearance and theme of your workspace
        </p>
      </div>

      <div className="vf-settings-section-content">
        <div className="vf-settings-group">
          <h3 className="vf-settings-group-title">Theme</h3>
          <div className="vf-settings-group-content">
            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Color Scheme</label>
                <span className="vf-settings-field-description">
                  Choose between dark, light, or auto (follows system preference)
                </span>
              </div>
              <div className="vf-settings-field-control">
                <select
                  value={settings.theme}
                  onChange={(e) => updateSettings({ theme: e.target.value as any })}
                  className="vf-settings-select"
                >
                  <option value="dark">Dark Theme</option>
                  <option value="light">Light Theme</option>
                  <option value="auto">Auto (System)</option>
                </select>
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Primary Color</label>
                <span className="vf-settings-field-description">
                  Main accent color used throughout the interface
                </span>
              </div>
              <div className="vf-settings-field-control">
                <div style={{ display: 'flex', gap: 'var(--vf-space-2)', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={settings.primaryColor}
                    onChange={(e) => updateSettings({ primaryColor: e.target.value })}
                    style={{
                      width: '40px',
                      height: '32px',
                      border: '1px solid var(--vf-border-primary)',
                      background: 'transparent',
                      cursor: 'pointer'
                    }}
                  />
                  <input
                    type="text"
                    value={settings.primaryColor}
                    onChange={(e) => updateSettings({ primaryColor: e.target.value })}
                    placeholder="#CAC4B7"
                    className="vf-settings-input"
                    style={{ width: '120px' }}
                  />
                </div>
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Preset Colors</label>
                <span className="vf-settings-field-description">
                  Quick access to predefined color schemes
                </span>
              </div>
              <div className="vf-settings-field-control">
                <div style={{ display: 'flex', gap: 'var(--vf-space-2)' }}>
                  {predefinedColors.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => updateSettings({ primaryColor: color.value })}
                      title={color.name}
                      style={{
                        width: '32px',
                        height: '32px',
                        background: color.value,
                        border: settings.primaryColor === color.value
                          ? '2px solid var(--vf-text-primary)'
                          : '1px solid var(--vf-border-primary)',
                        cursor: 'pointer',
                        transition: 'all var(--vf-transition-fast)'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="vf-settings-group">
          <h3 className="vf-settings-group-title">Typography</h3>
          <div className="vf-settings-group-content">
            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Font Size</label>
                <span className="vf-settings-field-description">
                  Base font size for the interface (12-20px)
                </span>
              </div>
              <div className="vf-settings-field-control">
                <input
                  type="number"
                  value={settings.fontSize}
                  onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) })}
                  min="12"
                  max="20"
                  className="vf-settings-input"
                  style={{ width: '80px' }}
                />
              </div>
            </div>

            <div className="vf-settings-field-row">
              <div className="vf-settings-field-info">
                <label className="vf-settings-field-label">Font Family</label>
                <span className="vf-settings-field-description">
                  Primary font family for the interface
                </span>
              </div>
              <div className="vf-settings-field-control">
                <select
                  value={settings.fontFamily}
                  onChange={(e) => updateSettings({ fontFamily: e.target.value })}
                  className="vf-settings-select"
                >
                  <option value="Inter">Inter</option>
                  <option value="Space Grotesk">Space Grotesk</option>
                  <option value="JetBrains Mono">JetBrains Mono</option>
                  <option value="system-ui">System Default</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
