/**
 * Project type detection and build command utilities
 */

export type ProjectType =
  | 'node-js'
  | 'typescript'
  | 'react'
  | 'next-js'
  | 'vue'
  | 'python'
  | 'django'
  | 'flask'
  | 'fastapi'
  | 'go'
  | 'rust'
  | 'java'
  | 'unknown';

export interface ProjectMetadata {
  type: ProjectType;
  hasPackageJson: boolean;
  hasRequirementsTxt: boolean;
  hasPipfile: boolean;
  hasGoMod: boolean;
  hasCargoToml: boolean;
  hasPomXml: boolean;
  framework?: string;
  buildCommand?: string;
  devCommand?: string;
  installCommand?: string;
}

/**
 * Detect project type by analyzing file structure
 */
export async function detectProjectType(
  files: Array<{ path: string; is_directory: boolean }>
): Promise<ProjectMetadata> {
  const filePaths = files.map(f => f.path.toLowerCase());
  const hasFile = (name: string) => filePaths.some(p => p.endsWith(name) || p === `/${name}`);
  const hasFileInRoot = (name: string) => filePaths.some(p => p === `/${name}`);

  const metadata: ProjectMetadata = {
    type: 'unknown',
    hasPackageJson: hasFile('package.json'),
    hasRequirementsTxt: hasFile('requirements.txt'),
    hasPipfile: hasFile('pipfile'),
    hasGoMod: hasFile('go.mod'),
    hasCargoToml: hasFile('cargo.toml'),
    hasPomXml: hasFile('pom.xml'),
  };

  // Node.js / JavaScript / TypeScript detection
  if (metadata.hasPackageJson) {
    // Check for framework-specific files
    if (hasFile('next.config.js') || hasFile('next.config.ts') || hasFile('next.config.mjs')) {
      metadata.type = 'next-js';
      metadata.framework = 'Next.js';
      metadata.installCommand = 'npm install';
      metadata.buildCommand = 'npm run build';
      metadata.devCommand = 'npm run dev';
    } else if (hasFile('vite.config.js') || hasFile('vite.config.ts')) {
      // Could be React, Vue, or other Vite project
      if (filePaths.some(p => p.includes('app.tsx') || p.includes('app.jsx'))) {
        metadata.type = 'react';
        metadata.framework = 'React (Vite)';
      } else if (filePaths.some(p => p.includes('app.vue'))) {
        metadata.type = 'vue';
        metadata.framework = 'Vue (Vite)';
      } else {
        metadata.type = 'typescript';
        metadata.framework = 'Vite';
      }
      metadata.installCommand = 'npm install';
      metadata.buildCommand = 'npm run build';
      metadata.devCommand = 'npm run dev';
    } else if (hasFile('vue.config.js') || filePaths.some(p => p.includes('.vue'))) {
      metadata.type = 'vue';
      metadata.framework = 'Vue';
      metadata.installCommand = 'npm install';
      metadata.buildCommand = 'npm run build';
      metadata.devCommand = 'npm run serve';
    } else if (filePaths.some(p => p.includes('.tsx') || p.includes('.jsx'))) {
      metadata.type = 'react';
      metadata.framework = 'React';
      metadata.installCommand = 'npm install';
      metadata.buildCommand = 'npm run build';
      metadata.devCommand = 'npm start';
    } else if (filePaths.some(p => p.includes('.ts') && !p.includes('.tsx'))) {
      metadata.type = 'typescript';
      metadata.framework = 'TypeScript';
      metadata.installCommand = 'npm install';
      metadata.buildCommand = 'npm run build';
      metadata.devCommand = 'npm run dev';
    } else {
      metadata.type = 'node-js';
      metadata.framework = 'Node.js';
      metadata.installCommand = 'npm install';
      metadata.buildCommand = 'npm run build';
      metadata.devCommand = 'npm run dev';
    }
  }
  // Python detection
  else if (metadata.hasRequirementsTxt || metadata.hasPipfile) {
    if (hasFile('manage.py') || filePaths.some(p => p.includes('django'))) {
      metadata.type = 'django';
      metadata.framework = 'Django';
      metadata.installCommand = metadata.hasPipfile ? 'pipenv install' : 'pip install -r requirements.txt';
      metadata.devCommand = 'python manage.py runserver';
    } else if (filePaths.some(p => p.includes('app.py') || p.includes('flask'))) {
      metadata.type = 'flask';
      metadata.framework = 'Flask';
      metadata.installCommand = metadata.hasPipfile ? 'pipenv install' : 'pip install -r requirements.txt';
      metadata.devCommand = 'flask run';
    } else if (filePaths.some(p => p.includes('main.py') || p.includes('fastapi'))) {
      metadata.type = 'fastapi';
      metadata.framework = 'FastAPI';
      metadata.installCommand = metadata.hasPipfile ? 'pipenv install' : 'pip install -r requirements.txt';
      metadata.devCommand = 'uvicorn main:app --reload';
    } else {
      metadata.type = 'python';
      metadata.framework = 'Python';
      metadata.installCommand = metadata.hasPipfile ? 'pipenv install' : 'pip install -r requirements.txt';
    }
  }
  // Go detection
  else if (metadata.hasGoMod) {
    metadata.type = 'go';
    metadata.framework = 'Go';
    metadata.buildCommand = 'go build';
    metadata.devCommand = 'go run .';
  }
  // Rust detection
  else if (metadata.hasCargoToml) {
    metadata.type = 'rust';
    metadata.framework = 'Rust';
    metadata.buildCommand = 'cargo build';
    metadata.devCommand = 'cargo run';
  }
  // Java detection
  else if (metadata.hasPomXml) {
    metadata.type = 'java';
    metadata.framework = 'Java (Maven)';
    metadata.buildCommand = 'mvn package';
    metadata.devCommand = 'mvn spring-boot:run';
  }

  return metadata;
}

/**
 * Get build commands for a project type
 */
export function getBuildCommands(projectType: ProjectType): {
  install?: string;
  build?: string;
  dev?: string;
} {
  const commands: Record<ProjectType, { install?: string; build?: string; dev?: string }> = {
    'node-js': {
      install: 'npm install',
      build: 'npm run build',
      dev: 'npm run dev',
    },
    'typescript': {
      install: 'npm install',
      build: 'npm run build',
      dev: 'npm run dev',
    },
    'react': {
      install: 'npm install',
      build: 'npm run build',
      dev: 'npm start',
    },
    'next-js': {
      install: 'npm install',
      build: 'npm run build',
      dev: 'npm run dev',
    },
    'vue': {
      install: 'npm install',
      build: 'npm run build',
      dev: 'npm run serve',
    },
    'python': {
      install: 'pip install -r requirements.txt',
    },
    'django': {
      install: 'pip install -r requirements.txt',
      dev: 'python manage.py runserver',
    },
    'flask': {
      install: 'pip install -r requirements.txt',
      dev: 'flask run',
    },
    'fastapi': {
      install: 'pip install -r requirements.txt',
      dev: 'uvicorn main:app --reload',
    },
    'go': {
      build: 'go build',
      dev: 'go run .',
    },
    'rust': {
      build: 'cargo build',
      dev: 'cargo run',
    },
    'java': {
      build: 'mvn package',
      dev: 'mvn spring-boot:run',
    },
    'unknown': {},
  };

  return commands[projectType] || {};
}

/**
 * Determine if a project needs a build step before running
 */
export function needsBuildStep(projectType: ProjectType): boolean {
  return ['typescript', 'next-js', 'rust', 'go', 'java'].includes(projectType);
}
