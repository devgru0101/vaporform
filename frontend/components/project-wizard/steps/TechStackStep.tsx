'use client';

import React from 'react';

interface TechStackStepProps {
  projectData: any;
  updateProjectData: (updates: any) => void;
}

const TEMPLATES = [
  { id: 'encore-react', name: 'Encore.ts + React', description: 'Modern full-stack TypeScript' },
  { id: 'encore-solid', name: 'Encore.ts + Solid.js', description: 'High-performance reactive frontend' },
  { id: 'encore-vue', name: 'Encore.go + Vue 3', description: 'Scalable Go with Vue.js' },
];

export const TechStackStep: React.FC<TechStackStepProps> = ({
  projectData,
  updateProjectData
}) => {
  const selected = projectData.techStack?.selectedTemplate || 'encore-react';

  const selectTemplate = (id: string) => {
    updateProjectData({
      techStack: {
        ...projectData.techStack,
        selectedTemplate: id
      }
    });
  };

  return (
    <div className="vf-wizard-step">
      <h3 className="vf-wizard-step-title">CHOOSE YOUR TECH STACK</h3>
      <p className="vf-wizard-step-description">
        Select the technology foundation for your project
      </p>

      <div className="vf-template-grid">
        {TEMPLATES.map(template => (
          <div
            key={template.id}
            className={`vf-template-card ${selected === template.id ? 'selected' : ''}`}
            onClick={() => selectTemplate(template.id)}
          >
            <h4>{template.name}</h4>
            <p>{template.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
