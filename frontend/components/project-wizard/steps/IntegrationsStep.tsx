'use client';

import React from 'react';

interface IntegrationsStepProps {
  projectData: any;
  updateProjectData: (updates: any) => void;
}

export const IntegrationsStep: React.FC<IntegrationsStepProps> = ({
  projectData,
  updateProjectData
}) => {
  return (
    <div className="vf-wizard-step">
      <h3 className="vf-wizard-step-title">ADD INTEGRATIONS</h3>
      <p className="vf-wizard-step-description">
        Optional: Add third-party services (can be configured later)
      </p>

      <div className="vf-integrations-notice">
        <p>Integrations will be pre-configured in your generated project.</p>
        <p>You can add authentication, payments, and analytics later.</p>
      </div>
    </div>
  );
};
