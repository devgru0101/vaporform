/**
 * Docker Deployment Manager
 * Manages Docker containers and deployments with dynamic subdomains
 */

import Docker from 'dockerode';
import { SQLDatabase } from 'encore.dev/storage/sqldb';
import { gridfs } from '../vfs/gridfs.js';
import { generateSubdomain } from '../shared/utils.js';
import { ValidationError, NotFoundError } from '../shared/errors.js';
// @ts-ignore - tar-stream doesn't have TypeScript declarations
import * as tar from 'tar-stream';
import { Readable } from 'stream';

const db = new SQLDatabase('infra', {
  migrations: './migrations',
});

type DeploymentStatus = 'pending' | 'building' | 'deploying' | 'running' | 'stopped' | 'failed' | 'deleted';
type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

interface Deployment {
  id: bigint;
  project_id: bigint;
  container_id?: string;
  image_name?: string;
  status: DeploymentStatus;
  subdomain?: string;
  url?: string;
  ports?: Record<string, number>;
  environment?: Record<string, string>;
  error_message?: string;
  health_status?: HealthStatus;
  last_health_check?: Date;
  deployed_at?: Date;
  stopped_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export class DockerManager {
  private docker: Docker;
  private readonly basePort = 3000;
  private readonly maxPort = 4000;

  constructor() {
    // Connect to Docker daemon
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  /**
   * Create a deployment for a project
   */
  async createDeployment(
    projectId: bigint,
    environment?: Record<string, string>
  ): Promise<Deployment> {
    // Generate unique subdomain from project ID
    const subdomain = generateSubdomain(`project-${projectId}`);

    // Create deployment record
    const deployment = await db.queryRow<Deployment>`
      INSERT INTO deployments (project_id, status, subdomain, environment)
      VALUES (
        ${projectId},
        'pending',
        ${subdomain},
        ${environment ? JSON.stringify(environment) : null}
      )
      RETURNING *
    `;

    if (!deployment) {
      throw new Error('Failed to create deployment');
    }

    // Start deployment process in background
    this.deployProject(deployment.id, projectId).catch(err => {
      console.error(`Failed to deploy ${deployment.id}:`, err);
    });

    console.log(`✓ Created deployment ${deployment.id} for project ${projectId}`);

    return deployment;
  }

  /**
   * Deploy a project (build image and start container)
   */
  private async deployProject(deploymentId: bigint, projectId: bigint): Promise<void> {
    try {
      // Update status to building
      await db.exec`
        UPDATE deployments
        SET status = 'building', updated_at = NOW()
        WHERE id = ${deploymentId}
      `;

      await this.addLog(deploymentId, 'info', 'Starting build process');

      // Build Docker image
      const imageName = await this.buildImage(deploymentId, projectId);

      await this.addLog(deploymentId, 'info', `Built image: ${imageName}`);

      // Update status to deploying
      await db.exec`
        UPDATE deployments
        SET status = 'deploying', image_name = ${imageName}, updated_at = NOW()
        WHERE id = ${deploymentId}
      `;

      // Allocate port
      const externalPort = await this.allocatePort(deploymentId, 3000); // Internal port 3000

      await this.addLog(deploymentId, 'info', `Allocated port: ${externalPort}`);

      // Get deployment info
      const deployment = await db.queryRow<Deployment>`
        SELECT * FROM deployments WHERE id = ${deploymentId}
      `;

      if (!deployment) {
        throw new Error('Deployment not found');
      }

      // Start container
      const container = await this.docker.createContainer({
        Image: imageName,
        name: `vaporform-${deploymentId}`,
        Env: deployment.environment
          ? Object.entries(deployment.environment).map(([k, v]) => `${k}=${v}`)
          : [],
        ExposedPorts: {
          '3000/tcp': {},
        },
        HostConfig: {
          PortBindings: {
            '3000/tcp': [{ HostPort: externalPort.toString() }],
          },
          RestartPolicy: {
            Name: 'unless-stopped',
          },
          NetworkMode: 'vaporform-network',
        },
        Labels: {
          'traefik.enable': 'true',
          [`traefik.http.routers.deploy-${deploymentId}.rule`]: `Host(\`${deployment.subdomain}.vaporform.dev\`)`,
          [`traefik.http.routers.deploy-${deploymentId}.entrypoints`]: 'websecure',
          [`traefik.http.routers.deploy-${deploymentId}.tls.certresolver`]: 'letsencrypt',
          [`traefik.http.services.deploy-${deploymentId}.loadbalancer.server.port`]: '3000',
          'vaporform.deployment.id': deploymentId.toString(),
          'vaporform.project.id': projectId.toString(),
        },
      });

      await container.start();

      const containerInfo = await container.inspect();

      // Generate URL
      const url = `https://${deployment.subdomain}.vaporform.dev`;

      // Update deployment with container info
      await db.exec`
        UPDATE deployments
        SET
          status = 'running',
          container_id = ${containerInfo.Id},
          url = ${url},
          ports = ${JSON.stringify({ '3000': externalPort })},
          deployed_at = NOW(),
          health_status = 'unknown',
          updated_at = NOW()
        WHERE id = ${deploymentId}
      `;

      await this.addLog(deploymentId, 'info', `Deployment running at ${url}`);

      console.log(`✓ Deployed project ${projectId} at ${url}`);
    } catch (error) {
      console.error(`Error deploying ${deploymentId}:`, error);

      await db.exec`
        UPDATE deployments
        SET
          status = 'failed',
          error_message = ${error instanceof Error ? error.message : 'Unknown error'},
          updated_at = NOW()
        WHERE id = ${deploymentId}
      `;

      await this.addLog(
        deploymentId,
        'error',
        `Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Build Docker image from project files
   */
  private async buildImage(deploymentId: bigint, projectId: bigint): Promise<string> {
    const imageName = `vaporform/project-${projectId}:${deploymentId}`;

    // Get all project files from VFS
    const files: Array<{ path: string; content: Buffer }> = [];
    const fileMetadata: Array<{ path: string }> = [];

    for await (const meta of db.query<{ path: string }>`
      SELECT path FROM file_metadata
      WHERE project_id = ${projectId}
      AND is_directory = false
      AND deleted_at IS NULL
    `) {
      fileMetadata.push(meta);
    }

    // Read all files
    for (const meta of fileMetadata) {
      try {
        const content = await gridfs.readFile(projectId, meta.path);
        files.push({ path: meta.path, content });
      } catch (error) {
        console.warn(`Could not read file ${meta.path}:`, error);
      }
    }

    // Create tar archive
    const pack = tar.pack();

    // Add Dockerfile if not present
    const hasDockerfile = files.some(f => f.path === '/Dockerfile');
    if (!hasDockerfile) {
      const defaultDockerfile = `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install --production || true
EXPOSE 3000
CMD ["npm", "start"]
`;
      pack.entry({ name: 'Dockerfile' }, defaultDockerfile);
    }

    // Add all project files
    for (const file of files) {
      const name = file.path.startsWith('/') ? file.path.slice(1) : file.path;
      pack.entry({ name }, file.content);
    }

    pack.finalize();

    // Build image
    const stream = await this.docker.buildImage(pack as any, {
      t: imageName,
    });

    // Wait for build to complete
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return imageName;
  }

  /**
   * Allocate an available external port
   */
  private async allocatePort(deploymentId: bigint, internalPort: number): Promise<number> {
    // Get all allocated ports
    const allocatedPorts: Set<number> = new Set();

    for await (const port of db.query<{ external_port: number }>`
      SELECT external_port FROM port_allocations
    `) {
      allocatedPorts.add(port.external_port);
    }

    // Find available port
    for (let port = this.basePort; port <= this.maxPort; port++) {
      if (!allocatedPorts.has(port)) {
        // Allocate port
        await db.exec`
          INSERT INTO port_allocations (deployment_id, internal_port, external_port)
          VALUES (${deploymentId}, ${internalPort}, ${port})
        `;

        return port;
      }
    }

    throw new Error('No available ports in range');
  }

  /**
   * Get deployment by ID
   */
  async getDeployment(deploymentId: bigint): Promise<Deployment> {
    const deployment = await db.queryRow<Deployment>`
      SELECT * FROM deployments
      WHERE id = ${deploymentId}
      AND deleted_at IS NULL
    `;

    if (!deployment) {
      throw new NotFoundError(`Deployment not found: ${deploymentId}`);
    }

    return deployment;
  }

  /**
   * Get active deployment for a project
   */
  async getProjectDeployment(projectId: bigint): Promise<Deployment | null> {
    const deployment = await db.queryRow<Deployment>`
      SELECT * FROM deployments
      WHERE project_id = ${projectId}
      AND status IN ('running', 'deploying', 'building')
      AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;

    return deployment || null;
  }

  /**
   * List all deployments for a project
   */
  async listDeployments(projectId: bigint, limit: number = 20): Promise<Deployment[]> {
    const deployments: Deployment[] = [];

    for await (const deployment of db.query<Deployment>`
      SELECT * FROM deployments
      WHERE project_id = ${projectId}
      AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) {
      deployments.push(deployment);
    }

    return deployments;
  }

  /**
   * Stop a deployment
   */
  async stopDeployment(deploymentId: bigint): Promise<void> {
    const deployment = await this.getDeployment(deploymentId);

    if (deployment.status === 'stopped') {
      return; // Already stopped
    }

    if (deployment.container_id) {
      try {
        const container = this.docker.getContainer(deployment.container_id);
        await container.stop();
        await this.addLog(deploymentId, 'info', 'Container stopped');
      } catch (error) {
        console.warn(`Could not stop container ${deployment.container_id}:`, error);
      }
    }

    await db.exec`
      UPDATE deployments
      SET status = 'stopped', stopped_at = NOW(), updated_at = NOW()
      WHERE id = ${deploymentId}
    `;

    console.log(`✓ Stopped deployment ${deploymentId}`);
  }

  /**
   * Delete a deployment
   */
  async deleteDeployment(deploymentId: bigint): Promise<void> {
    const deployment = await this.getDeployment(deploymentId);

    // Stop if running
    if (deployment.status === 'running') {
      await this.stopDeployment(deploymentId);
    }

    // Remove container
    if (deployment.container_id) {
      try {
        const container = this.docker.getContainer(deployment.container_id);
        await container.remove({ force: true });
        await this.addLog(deploymentId, 'info', 'Container removed');
      } catch (error) {
        console.warn(`Could not remove container ${deployment.container_id}:`, error);
      }
    }

    // Remove image
    if (deployment.image_name) {
      try {
        const image = this.docker.getImage(deployment.image_name);
        await image.remove();
        await this.addLog(deploymentId, 'info', 'Image removed');
      } catch (error) {
        console.warn(`Could not remove image ${deployment.image_name}:`, error);
      }
    }

    await db.exec`
      UPDATE deployments
      SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${deploymentId}
    `;

    console.log(`✓ Deleted deployment ${deploymentId}`);
  }

  /**
   * Check deployment health
   */
  async checkHealth(deploymentId: bigint): Promise<HealthStatus> {
    const deployment = await this.getDeployment(deploymentId);

    if (!deployment.container_id) {
      return 'unknown';
    }

    try {
      const container = this.docker.getContainer(deployment.container_id);
      const info = await container.inspect();

      const isRunning = info.State.Running;
      const health: HealthStatus = isRunning ? 'healthy' : 'unhealthy';

      await db.exec`
        UPDATE deployments
        SET health_status = ${health}, last_health_check = NOW(), updated_at = NOW()
        WHERE id = ${deploymentId}
      `;

      return health;
    } catch (error) {
      console.warn(`Health check failed for deployment ${deploymentId}:`, error);

      await db.exec`
        UPDATE deployments
        SET health_status = 'unknown', last_health_check = NOW(), updated_at = NOW()
        WHERE id = ${deploymentId}
      `;

      return 'unknown';
    }
  }

  /**
   * Get container logs
   */
  async getContainerLogs(deploymentId: bigint, tail: number = 100): Promise<string> {
    const deployment = await this.getDeployment(deploymentId);

    if (!deployment.container_id) {
      return 'No container found';
    }

    try {
      const container = this.docker.getContainer(deployment.container_id);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail,
      });

      return logs.toString('utf-8');
    } catch (error) {
      console.error(`Could not get logs for container ${deployment.container_id}:`, error);
      return `Error getting logs: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Add log entry for deployment
   */
  private async addLog(
    deploymentId: bigint,
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string
  ): Promise<void> {
    await db.exec`
      INSERT INTO deployment_logs (deployment_id, log_level, message)
      VALUES (${deploymentId}, ${level}, ${message})
    `;
  }

  /**
   * Get logs for deployment
   */
  async getLogs(deploymentId: bigint, limit: number = 100): Promise<Array<{
    id: bigint;
    log_level: string;
    message: string;
    timestamp: Date;
  }>> {
    const logs: Array<{
      id: bigint;
      log_level: string;
      message: string;
      timestamp: Date;
    }> = [];

    for await (const log of db.query<{
      id: bigint;
      log_level: string;
      message: string;
      timestamp: Date;
    }>`
      SELECT * FROM deployment_logs
      WHERE deployment_id = ${deploymentId}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `) {
      logs.push(log);
    }

    return logs.reverse(); // Return in chronological order
  }
}

// Singleton instance
export const dockerManager = new DockerManager();
