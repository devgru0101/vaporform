'use client';

import React from 'react';

interface ReviewStepProps {
  projectData: any;
  onGenerate: () => void;
  isGenerating: boolean;
}

export const ReviewStep: React.FC<ReviewStepProps> = ({
  projectData,
  onGenerate,
  isGenerating
}) => {
  return (
    <div className="vf-wizard-step">
      <h3 className="vf-wizard-step-title">REVIEW & GENERATE</h3>
      <p className="vf-wizard-step-description">
        Review your project configuration
      </p>

      <div className="vf-review-section">
        <h4>PROJECT OVERVIEW</h4>
        <div className="vf-review-item">
          <strong>Name:</strong> {projectData.vision?.name}
        </div>
        <div className="vf-review-item">
          <strong>Description:</strong> {projectData.vision?.description}
        </div>
        <div className="vf-review-item">
          <strong>Tech Stack:</strong> {projectData.techStack?.selectedTemplate}
        </div>
      </div>

      <div className="vf-review-cta">
        <p>Ready to generate your project?</p>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="vf-btn vf-btn-primary vf-btn-large"
        >
          {isGenerating ? 'GENERATING...' : '✨ GENERATE MY PROJECT'}
        </button>
      </div>
    </div>
  );
};
