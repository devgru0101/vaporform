/**
 * Project Generation Prompt Templates
 * Converts wizard data into comprehensive AI prompts
 */

import type { WizardData } from '../shared/types.js';

export { WizardData };

const TEMPLATE_CONFIGS = {
  'encore-react': {
    name: 'Encore.ts + React',
    backend: 'Encore.ts',
    frontend: 'React with TypeScript',
    database: 'PostgreSQL',
    buildCommand: 'npm run build',
    devCommand: 'npm run dev',
    description: 'Modern full-stack TypeScript with Encore backend and React frontend'
  },
  'encore-solid': {
    name: 'Encore.ts + Solid.js',
    backend: 'Encore.ts',
    frontend: 'Solid.js with TypeScript',
    database: 'PostgreSQL',
    buildCommand: 'npm run build',
    devCommand: 'npm run dev',
    description: 'High-performance setup with Encore backend and Solid.js reactive frontend'
  },
  'encore-vue': {
    name: 'Encore.go + Vue 3',
    backend: 'Encore.go',
    frontend: 'Vue 3 with TypeScript',
    database: 'PostgreSQL',
    buildCommand: 'go build',
    devCommand: 'encore run',
    description: 'Scalable Go backend with modern Vue.js frontend'
  },
  'custom': {
    name: 'Custom Stack',
    backend: 'Custom',
    frontend: 'Custom',
    database: 'Custom',
    buildCommand: 'npm run build',
    devCommand: 'npm run dev',
    description: 'Custom technology stack'
  }
};

/**
 * Build comprehensive project generation prompt from wizard data
 */
export function buildProjectGenerationPrompt(wizardData: WizardData): string {
  const template = TEMPLATE_CONFIGS[wizardData.techStack.selectedTemplate as keyof typeof TEMPLATE_CONFIGS] || TEMPLATE_CONFIGS['encore-react'];

  const prompt = `You are an expert full-stack developer tasked with generating a complete, production-ready ${template.name} project from scratch.

# Project Overview

**Project Name**: ${wizardData.vision.name}

**Description**: ${wizardData.vision.description}

**Core Features & Functionality**:
${wizardData.vision.coreFeatures}

${wizardData.vision.targetAudience ? `**Target Audience**: ${wizardData.vision.targetAudience}\n` : ''}

${wizardData.vision.projectGoals.length > 0 ? `**Project Goals**:
${wizardData.vision.projectGoals.map((goal: string, i: number) => `${i + 1}. ${goal}`).join('\n')}
` : ''}

${wizardData.vision.inspirationApps.length > 0 ? `**Inspiration**:
This project draws inspiration from: ${wizardData.vision.inspirationApps.join(', ')}
` : ''}

# Technology Stack

**Backend**: ${template.backend}
**Frontend**: ${template.frontend}
**Database**: ${template.database}

${wizardData.techStack.backend ? `**Custom Backend**: ${wizardData.techStack.backend}\n` : ''}
${wizardData.techStack.frontend ? `**Custom Frontend**: ${wizardData.techStack.frontend}\n` : ''}
${wizardData.techStack.database ? `**Custom Database**: ${wizardData.techStack.database}\n` : ''}

${formatIntegrations(wizardData.integrations)}

# Generation Instructions

Please generate a **complete, functional, production-ready** project following these steps:

## Phase 1: Project Structure & Setup (Steps 1-3)

1. **Create Project Structure**
   ${getStructureInstructions(template)}

2. **Configuration Files**
   - Create package.json with all necessary dependencies
   - Create tsconfig.json for TypeScript configuration
   - Create .env.example with required environment variables
   - Create .gitignore
   - Create README.md with setup instructions

3. **Initialize Project**
   - Use execute_command to run: npm init -y (if needed)
   - Use execute_command to run: npm install (install dependencies)

## Phase 2: Backend Implementation (Steps 4-6)

4. **Database Schema**
   ${getDatabaseInstructions(wizardData, template)}

5. **API Endpoints**
   ${getAPIInstructions(wizardData, template)}

6. **Business Logic**
   - Implement core feature logic based on the requirements
   - Add validation and error handling
   - Include proper TypeScript types

## Phase 3: Frontend Implementation (Steps 7-9)

7. **Component Structure**
   ${getFrontendInstructions(wizardData, template)}

8. **State Management**
   - Set up state management (Context API, Zustand, or appropriate solution)
   - Create hooks for API calls
   - Implement loading and error states

9. **Styling**
   - Create a cohesive design system
   - Implement responsive layouts
   - Add proper CSS/styling framework

## Phase 4: Integration & Testing (Steps 10-12)

10. **Third-Party Integrations**
    ${getIntegrationImplementationSteps(wizardData.integrations)}

11. **Testing Setup**
    - Create basic test structure
    - Add example unit tests
    - Add integration test examples

12. **Build & Verify**
    - Use execute_command to run: ${template.buildCommand}
    - Verify build succeeds
    - Check for TypeScript errors

## Phase 5: Documentation & Completion (Steps 13-14)

13. **Documentation**
    - Update README.md with:
      * Project description
      * Setup instructions
      * Available scripts
      * Environment variables
      * API documentation
    - Create DEVELOPMENT.md with development guidelines
    - Add inline code comments where needed

14. **Final Verification**
    - Use read_file to verify key files are created
    - Check that all required features are implemented
    - Use attempt_completion with summary of what was built

# Important Guidelines

**File Operations**:
- Always use write_to_file with COMPLETE file contents (never truncate)
- Provide accurate line_count when writing files
- Use read_file to verify files after writing
- Organize code into logical modules and components

**Code Quality**:
- Follow TypeScript best practices
- Use proper error handling
- Add JSDoc comments for functions
- Follow the tech stack's conventions
- Make code production-ready, not prototype quality

**Project Structure**:
- Follow standard conventions for the chosen tech stack
- Separate concerns (routes, services, components)
- Create reusable utilities and helpers
- Proper folder organization

**Implementation**:
- Implement ALL core features described in the requirements
- Don't use placeholder or mock data for core functionality
- Create a fully functional application
- Include proper authentication if required
- Set up database connections and models

**Progress Reporting**:
- Work systematically through each phase
- Use ask_followup_question if requirements are unclear
- Report progress as you complete major steps
- Use attempt_completion when the project is fully functional

Begin by creating the project structure and configuration files. Work methodically through each phase, building a complete, working application that fulfills all the specified requirements.`;

  return prompt;
}

/**
 * Get structure instructions based on template
 */
function getStructureInstructions(template: any): string {
  if (template.backend === 'Encore.ts') {
    return `   - Create Encore.ts service structure:
     * /services (API services)
     * /lib (shared utilities)
     * /types (TypeScript types)
     * encore.app configuration
   - Create frontend structure:
     * /frontend/src/components
     * /frontend/src/pages
     * /frontend/src/hooks
     * /frontend/src/lib
     * /frontend/src/styles`;
  }

  return `   - Create standard project structure for ${template.name}
   - Separate backend and frontend directories
   - Include proper configuration files`;
}

/**
 * Get database instructions
 */
function getDatabaseInstructions(wizardData: WizardData, template: any): string {
  if (template.backend === 'Encore.ts') {
    return `   - Create database migrations in /migrations
   - Define TypeScript interfaces for all data models
   - Create database schema based on core features
   - Example: If building a task app, create tables for users, tasks, projects, etc.`;
  }

  return `   - Set up database schema appropriate for ${template.database}
   - Create models/entities based on project requirements
   - Add necessary indexes and constraints`;
}

/**
 * Get API instructions
 */
function getAPIInstructions(wizardData: WizardData, template: any): string {
  const features = wizardData.vision.coreFeatures.toLowerCase();

  let suggestions = [];
  if (features.includes('user') || features.includes('auth')) {
    suggestions.push('User management and authentication endpoints');
  }
  if (features.includes('crud') || features.includes('create') || features.includes('manage')) {
    suggestions.push('Full CRUD operations for main entities');
  }
  if (features.includes('search')) {
    suggestions.push('Search and filtering endpoints');
  }
  if (features.includes('real-time') || features.includes('live')) {
    suggestions.push('WebSocket or SSE for real-time updates');
  }

  return `   - Create RESTful API endpoints for all core features
   - Suggested endpoints based on requirements:
     ${suggestions.map(s => `* ${s}`).join('\n     ')}
   - Add proper request validation
   - Include error handling middleware
   - Add authentication middleware if needed`;
}

/**
 * Get frontend instructions
 */
function getFrontendInstructions(wizardData: WizardData, template: any): string {
  return `   - Create main layout components (Header, Footer, Sidebar)
   - Build page components for each major feature
   - Create reusable UI components (Button, Input, Card, etc.)
   - Implement routing between pages
   - Connect to backend APIs
   - Add loading states and error boundaries`;
}

/**
 * Format integrations section
 */
function formatIntegrations(integrations: Record<string, any>): string {
  if (Object.keys(integrations).length === 0) {
    return '**Integrations**: None specified\n';
  }

  let integrationsText = '# Integrations\n\n';

  for (const [category, integration] of Object.entries(integrations)) {
    integrationsText += `**${category}**: ${integration.provider}\n`;
    if (integration.config && Object.keys(integration.config).length > 0) {
      integrationsText += `Configuration needed:\n`;
      for (const [key, value] of Object.entries(integration.config)) {
        integrationsText += `- ${key}: ${value || '[to be configured]'}\n`;
      }
    }
    integrationsText += '\n';
  }

  return integrationsText;
}

/**
 * Get integration implementation steps
 */
function getIntegrationImplementationSteps(integrations: Record<string, any>): string {
  if (Object.keys(integrations).length === 0) {
    return '    - No integrations to implement';
  }

  let steps = [];

  for (const [category, integration] of Object.entries(integrations)) {
    const provider = integration.provider;

    if (category === 'authentication') {
      if (provider.toLowerCase().includes('clerk')) {
        steps.push(`- Install @clerk/clerk-sdk-node and frontend SDK`);
        steps.push(`- wrapping App with <ClerkProvider>`);
        steps.push(`- Add <SignIn> and <SignUp> components`);
      } else {
        steps.push(`- Implement ${provider} authentication flow`);
        steps.push(`- Create auth middleware and protected routes`);
      }
    } else if (category === 'payments') {
      if (provider.toLowerCase().includes('stripe')) {
        steps.push(`- Install stripe and @stripe/stripe-js`);
        steps.push(`- Create webhook handler for payment events`);
        steps.push(`- Implement Checkout Session creation endpoint`);
      } else {
        steps.push(`- Integrate ${provider} SDK`);
        steps.push(`- Create payment processing endpoints`);
      }
    } else if (category === 'analytics') {
      steps.push(`- Add ${provider} tracking code`);
      steps.push(`- Set up event tracking for key user actions`);
    } else {
      steps.push(`- Integrate ${provider} for ${category}`);
    }
  }

  return steps.map(s => `    ${s}`).join('\n');
}

/**
 * Build a simpler prompt for quick testing
 */
export function buildSimpleProjectPrompt(projectName: string, description: string): string {
  return `Create a simple ${projectName} project.

${description}

Use Encore.ts for the backend and React for the frontend. Create a basic working application with:
1. Project structure
2. A few API endpoints
3. Basic frontend pages
4. README with setup instructions

Use write_to_file to create all files and execute_command to set up the project.`;
}
