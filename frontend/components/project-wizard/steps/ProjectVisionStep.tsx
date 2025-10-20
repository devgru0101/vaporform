'use client';

import React, { useState, useEffect } from 'react';

interface ProjectVisionStepProps {
  projectData: any;
  updateProjectData: (updates: any) => void;
}

export const ProjectVisionStep: React.FC<ProjectVisionStepProps> = ({
  projectData,
  updateProjectData
}) => {
  const [formData, setFormData] = useState({
    name: projectData.vision?.name || '',
    description: projectData.vision?.description || '',
    coreFeatures: projectData.vision?.coreFeatures || '',
    targetAudience: projectData.vision?.targetAudience || '',
    projectGoals: projectData.vision?.projectGoals || [],
    inspirationApps: projectData.vision?.inspirationApps || []
  });

  const [currentGoal, setCurrentGoal] = useState('');

  useEffect(() => {
    updateProjectData({
      vision: formData
    });
  }, [formData]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addGoal = () => {
    if (currentGoal.trim()) {
      handleChange('projectGoals', [...formData.projectGoals, currentGoal.trim()]);
      setCurrentGoal('');
    }
  };

  const removeGoal = (index: number) => {
    handleChange('projectGoals', formData.projectGoals.filter((_, i) => i !== index));
  };

  return (
    <div className="vf-wizard-step">
      <h3 className="vf-wizard-step-title">DESCRIBE YOUR PROJECT VISION</h3>
      <p className="vf-wizard-step-description">
        Tell us what you want to build - the more detail, the better the result
      </p>

      <div className="vf-wizard-form">
        <div className="vf-form-group">
          <label className="vf-form-label required">PROJECT NAME</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="e.g., TaskFlow Pro, EcoMarket, GameHub"
            className="vf-form-input"
            maxLength={50}
          />
          <span className="vf-form-hint">{formData.name.length}/50 characters</span>
        </div>

        <div className="vf-form-group">
          <label className="vf-form-label required">PROJECT DESCRIPTION</label>
          <textarea
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Describe your project in detail. What problem does it solve? Who is it for?"
            className="vf-form-textarea"
            rows={4}
            maxLength={1000}
          />
          <span className="vf-form-hint">{formData.description.length}/1000 characters</span>
        </div>

        <div className="vf-form-group">
          <label className="vf-form-label required">CORE FUNCTIONALITY</label>
          <textarea
            value={formData.coreFeatures}
            onChange={(e) => handleChange('coreFeatures', e.target.value)}
            placeholder="List the main features and user flows..."
            className="vf-form-textarea"
            rows={3}
            maxLength={2000}
          />
          <span className="vf-form-hint">{formData.coreFeatures.length}/2000 characters</span>
        </div>

        <div className="vf-form-group">
          <label className="vf-form-label">TARGET AUDIENCE</label>
          <input
            type="text"
            value={formData.targetAudience}
            onChange={(e) => handleChange('targetAudience', e.target.value)}
            placeholder="e.g., Small business owners, Students, Developers"
            className="vf-form-input"
            maxLength={100}
          />
        </div>

        <div className="vf-form-group">
          <label className="vf-form-label">PROJECT GOALS</label>
          {formData.projectGoals.map((goal: string, index: number) => (
            <div key={index} className="vf-goal-item">
              <span>{goal}</span>
              <button onClick={() => removeGoal(index)} className="vf-goal-remove">×</button>
            </div>
          ))}
          <div className="vf-goal-input-row">
            <input
              type="text"
              value={currentGoal}
              onChange={(e) => setCurrentGoal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addGoal()}
              placeholder="Add a project goal..."
              className="vf-form-input"
            />
            <button onClick={addGoal} className="vf-btn vf-btn-secondary">ADD</button>
          </div>
        </div>
      </div>
    </div>
  );
};
