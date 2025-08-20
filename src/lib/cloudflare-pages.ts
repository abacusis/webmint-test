import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import JSZip from 'jszip';
import Cloudflare from 'cloudflare';

/**
 * CloudFlare Pages API Service
 * Handles deployment, listing, and deletion of pages
 */
export class CloudFlarePagesService {
  private cf: Cloudflare;
  private apiToken: string;
  private accountId: string;

  constructor(apiToken: string, accountId: string) {
    this.cf = new Cloudflare({ apiToken });
    this.apiToken = apiToken;
    this.accountId = accountId;
  }

  /**
   * Deploy a new page to CloudFlare Pages
   * @param projectName - Name of the project (optional, will use default if not provided)
   * @param files - Object with file paths as keys and content as values
   * @returns Deployment result
   */
  async deployPage(projectName: string | null = null, files: { html: string; css: string; js: string }) {
    try {
      // Use a default project name for all WebMint deployments or sanitize provided name
      const defaultProjectName = 'webmint-app';
      const finalProjectName = projectName ? this.sanitizeProjectName(projectName) : defaultProjectName;
      
      // First, ensure the project exists
      try {
        await this.cf.pages.projects.get(
          finalProjectName,
          { account_id: this.accountId },
        );
        console.log(`Using existing project: ${finalProjectName}`);
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('404')) {
          // Create new project if it doesn't exist
          console.log(`Creating new project: ${finalProjectName}`);
          await this.cf.pages.projects.create({
            account_id: this.accountId,
            name: finalProjectName,
            production_branch: 'main',
            build_config: {
              build_command: '',
              destination_dir: '/',
              root_dir: '/'
            }
          });
        } else {
          throw error;
        }
      }

      // Debug: Log original files
      console.log('=== ORIGINAL FILES DEBUG ===');
      console.log('HTML length:', files.html?.length || 0);
      console.log('CSS length:', files.css?.length || 0);
      console.log('JS length:', files.js?.length || 0);
      console.log('HTML preview:', files.html?.substring(0, 200) || 'EMPTY');

      // Prepare files for deployment
      const deploymentFiles = this.prepareDeploymentFiles(files);

      // Create local backup and ZIP for verification
      const { backupPath, zipBuffer } = await this.createLocalBackupAndZip(deploymentFiles, finalProjectName);
      console.log('Backup created at:', backupPath);
      console.log('ZIP backup size:', zipBuffer.length, 'bytes');

      // 1. Get upload token
      console.log('Getting upload token...');
      const tokenResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/pages/projects/${finalProjectName}/upload-token`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        throw new Error(`Failed to get upload token: ${JSON.stringify(errorData)}`);
      }

      const tokenData = await tokenResponse.json();
      const uploadToken = tokenData.result.jwt;
      console.log('Got upload token');

      // 2. Prepare files for upload
      const uploadFiles = [];

      // Add index.html
      const indexHtmlContent = Buffer.from(deploymentFiles['index.html'].content).toString('base64');
      uploadFiles.push({
        base64: true,
        key: crypto.createHash('md5').update(deploymentFiles['index.html'].content).digest('hex'),
        value: indexHtmlContent,
        metadata: {
          contentType: 'text/html'
        }
      });

      // Add script.js if exists
      if (deploymentFiles['script.js']?.content) {
        const jsContent = Buffer.from(deploymentFiles['script.js'].content).toString('base64');
        uploadFiles.push({
          base64: true,
          key: crypto.createHash('md5').update(deploymentFiles['script.js'].content).digest('hex'),
          value: jsContent,
          metadata: {
            contentType: 'application/javascript'
          }
        });
      }

      // Add styles.css if exists
      if (deploymentFiles['styles.css']?.content) {
        const cssContent = Buffer.from(deploymentFiles['styles.css'].content).toString('base64');
        uploadFiles.push({
          base64: true,
          key: crypto.createHash('md5').update(deploymentFiles['styles.css'].content).digest('hex'),
          value: cssContent,
          metadata: {
            contentType: 'text/css'
          }
        });
      }

      // Create manifest
      const manifest = {
        files: Object.fromEntries(
          Object.entries(deploymentFiles).map(([name, data]) => [
            name,
            {
              sha256: crypto.createHash('sha256').update(data.content).digest('hex')
            }
          ])
        )
      };

      // Add manifest.json
      uploadFiles.push({
        base64: true,
        key: crypto.createHash('md5').update(JSON.stringify(manifest)).digest('hex'),
        value: Buffer.from(JSON.stringify(manifest, null, 2)).toString('base64'),
        metadata: {
          contentType: 'application/json'
        }
      });

      // Create ZIP file
      const zip = new JSZip();
      Object.entries(deploymentFiles).forEach(([name, data]) => {
        zip.file(name, data.content);
      });
      const zipContent = await zip.generateAsync({ type: 'base64' });

      // Add ZIP file
      uploadFiles.push({
        base64: true,
        key: crypto.createHash('md5').update(await zip.generateAsync({ type: 'uint8array' })).digest('hex'),
        value: zipContent,
        metadata: {
          contentType: 'application/zip'
        }
      });

      // 3. Upload files
      console.log('Uploading files...');
      const uploadResponse = await fetch('https://api.cloudflare.com/client/v4/pages/assets/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${uploadToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(uploadFiles)
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(`Failed to upload files: ${JSON.stringify(errorData)}`);
      }

      const uploadResult = await uploadResponse.json();
      console.log('Upload successful:', uploadResult);

      // 4. Create deployment with uploaded files
      console.log('Creating deployment...');
      
      // Create manifest with MD5 hashes (matching the uploaded file keys)
      const manifestData: Record<string, string> = {};
      
      for (const [fileName, fileData] of Object.entries(deploymentFiles)) {
        const md5Hash = crypto.createHash('md5').update(fileData.content).digest('hex');
        manifestData[`/${fileName}`] = md5Hash; // CloudFlare expects paths with leading slash
      }
      
      // Add the ZIP file hash if it exists
      const zipFiles = new JSZip();
      Object.entries(deploymentFiles).forEach(([name, data]) => {
        zipFiles.file(name, data.content);
      });
      const zipContentFiles = await zipFiles.generateAsync({ type: 'uint8array' });
      const zipHash = crypto.createHash('md5').update(zipContentFiles).digest('hex');
      manifestData[`/${finalProjectName}-deployment.zip`] = zipHash;
      
      // Add manifest.json hash
      const manifestJson = {
        files: Object.fromEntries(
          Object.entries(deploymentFiles).map(([name, data]) => [
            name,
            {
              sha256: crypto.createHash('sha256').update(data.content).digest('hex')
            }
          ])
        )
      };
      const manifestJsonString = JSON.stringify(manifestJson, null, 2);
      const manifestJsonHash = crypto.createHash('md5').update(manifestJsonString).digest('hex');
      manifestData['/manifest.json'] = manifestJsonHash;
      
      console.log('Manifest data:', manifestData);
      
      // Create FormData for deployment
      const deploymentFormData = new FormData();
      deploymentFormData.append('manifest', JSON.stringify(manifestData));
      deploymentFormData.append('branch', 'main');
      
      const deploymentResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/pages/projects/${finalProjectName}/deployments`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`
            // Don't set Content-Type, let browser set it with boundary
          },
          body: deploymentFormData
        }
      );

      if (!deploymentResponse.ok) {
        const errorData = await deploymentResponse.json();
        console.warn('Deployment creation failed, but files were uploaded:', errorData);
        //https://c678f41b.testing-clg.pages.dev clean the subdomain
        const regex = /^[^.]+\.(.*)$/;
        const cleanUrl = deploymentResponse?.url?.replace(regex, '$1');
        // Return success anyway since files were uploaded
        return {
          success: true,
          deploymentId: 'uploaded',
          url: cleanUrl,
          projectName: finalProjectName,
          createdAt: new Date().toISOString(),
          method: 'direct-upload',
          warning: 'Files uploaded but deployment creation failed'
        };
      }

      const deploymentResult = await deploymentResponse.json();
      console.log('Deployment created:', deploymentResult);
      const regex = /^[^.]+\.(.*)$/;
      const cleanUrl = deploymentResult.result?.url?.replace(regex, '$1');

      return {
        success: true,
        deploymentId: deploymentResult.result?.id || 'created',
        url: `https://${cleanUrl}`,
        projectName: finalProjectName,
        createdAt: deploymentResult.result?.created_on || new Date().toISOString(),
        method: 'direct-upload'
      };

    } catch (error: unknown) {
      console.error('CloudFlare Pages deployment error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to deploy page'
      };
    }
  }

  /**
   * List all projects and their deployments
   * @returns List of projects with their deployments
   */
  async listPages() {
    try {
      const projects = await this.cf.pages.projects.list({
        account_id: this.accountId
      });

      const projectsWithDeployments = await Promise.all(
        (projects.result as Record<string, unknown>[]).map(async (project: Record<string, unknown>) => {
          try {
            const deployments = await this.cf.pages.projects.deployments.list(
              project.name as string,
              { account_id: this.accountId }
            );

            return {
              id: project.id as string,
              name: project.name as string,
              domain: (project.canonical_deployment as { url?: string })?.url || null,
              createdAt: project.created_on as string,
              deployments: (deployments.result as Record<string, unknown>[]).slice(0, 5).map((deployment: Record<string, unknown>) => ({
                id: deployment.id as string,
                url: deployment.url as string,
                status: (deployment.latest_stage as { status?: string })?.status || 'unknown',
                createdAt: deployment.created_on as string
              }))
            };
          } catch (error: unknown) {
            console.error(`Error fetching deployments for ${project.name}:`, error);
            return {
              id: project.id as string,
              name: project.name as string,
              domain: (project.canonical_deployment as { url?: string })?.url || null,
              createdAt: project.created_on as string,
              deployments: []
            };
          }
        })
      );

      return {
        success: true,
        projects: projectsWithDeployments
      };
    } catch (error: unknown) {
      console.error('CloudFlare Pages list error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list pages'
      };
    }
  }

  /**
   * Delete a project and all its deployments
   * @param projectName - Name of the project to delete
   * @returns Deletion result
   */
  async deletePage(projectName: string) {
    try {
      await this.cf.pages.projects.delete(
        projectName,
        {
          account_id: this.accountId,
        }
      );

      return {
        success: true,
        message: `Project ${projectName} deleted successfully`
      };
    } catch (error: unknown) {
      console.error('CloudFlare Pages deletion error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete page'
      };
    }
  }

  /**
   * Download deployment files for verification
   * @param projectName - Name of the project
   * @param deploymentId - ID of the deployment
   * @returns Object containing file contents
   */
  async downloadDeploymentFiles(projectName: string = 'webmint-app', deploymentId: string | null = null) {
    try {
      console.log('downloadDeploymentFiles called with:', { projectName, deploymentId });
      console.log('Account ID:', this.accountId);
      
      // If no deploymentId provided, get the latest deployment
      if (!deploymentId) {
        console.log('Getting deployments for project:', projectName);
        const deployments = await this.cf.pages.projects.deployments.list(
          projectName,
          { account_id: this.accountId }
        );

        console.log('Deployments response:', deployments);

        if (!deployments.result || deployments.result.length === 0) {
          return {
            success: false,
            error: `No deployments found for project ${projectName}. Please deploy something first.`,
            projectName: projectName,
            deploymentCount: 0
          };
        }

        deploymentId = (deployments.result[0] as Record<string, unknown>).id as string;
        console.log('Using deployment ID:', deploymentId);
      }

      // Get deployment details
      const deployment = await this.cf.pages.projects.deployments.get(
        projectName,
        deploymentId!,
        {
          account_id: this.accountId
        }
      );

      const deploymentData = deployment as { result?: { url?: string } };
      if (!deploymentData.result) {
        throw new Error('Deployment not found');
      }

      // Try to fetch files from the deployment URL
      const baseUrl = deploymentData.result.url as string;
      const files: Record<string, { content: string; size: number; type: string }> = {};

      // Common file names to try
      const fileNames = ['index.html', 'styles.css', 'script.js'];

      for (const fileName of fileNames) {
        try {
          const fileUrl = `${baseUrl}/${fileName}`;
          const response = await fetch(fileUrl);
          
          if (response.ok) {
            const content = await response.text();
            files[fileName] = {
              content: content,
              size: content.length,
              type: response.headers.get('content-type') || 'text/plain'
            };
          }
        } catch (error: unknown) {
          console.log(`Could not fetch ${fileName}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }

      return {
        success: true,
        deploymentId: deploymentId,
        deploymentUrl: baseUrl,
        files: files,
        fileCount: Object.keys(files).length
      };

      } catch (error: unknown) {
      console.error('Download deployment files error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to download deployment files'
      };
    }
  }

  /**
   * Create local backup of deployment files and return ZIP buffer
   * @param deploymentFiles - Files to backup
   * @param projectName - Project name for backup folder
   * @returns Backup path and ZIP buffer
   */
  async createLocalBackupAndZip(deploymentFiles: Record<string, { content: string; type: string }>, projectName: string) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(process.cwd(), 'backups', `${projectName}-${timestamp}`);
      
      // Create backup directory
      await fs.promises.mkdir(backupDir, { recursive: true });
      
      // Save individual files
      const filePaths = [];
      for (const [fileName, fileData] of Object.entries(deploymentFiles)) {
        const filePath = path.join(backupDir, fileName);
        await fs.promises.writeFile(filePath, fileData.content, 'utf8');
        filePaths.push(filePath);
        console.log(`Backup saved: ${fileName} (${fileData.content.length} chars)`);
      }
      
      // Create ZIP file
      const zip = new JSZip();
      for (const [fileName, fileData] of Object.entries(deploymentFiles)) {
        zip.file(fileName, fileData.content);
      }
      
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      const zipPath = path.join(backupDir, `${projectName}-deployment.zip`);
      await fs.promises.writeFile(zipPath, zipBuffer);
      
      console.log(`ZIP backup created: ${zipPath} (${zipBuffer.length} bytes)`);
      
      return {
        backupPath: backupDir,
        zipBuffer: zipBuffer
      };
    } catch (error: unknown) {
      console.error('Failed to create local backup:', error);
      throw error;
    }
  }

  /**
   * Prepare files for CloudFlare Pages deployment
   * @private
   */
  private prepareDeploymentFiles({ html, css, js }: { html: string; css: string; js: string }) {
    const files: Record<string, { content: string; type: string }> = {};

    // Always create index.html with embedded CSS and JS for simplicity
    const fullHtml = this.createFullHtmlPage(html, css, js);
    files['index.html'] = {
      content: fullHtml,
      type: 'text/html'
    };

    // For debugging, let's also create separate files if they exist
    if (css && css.trim().length > 0) {
      files['styles.css'] = {
        content: css.trim(),
        type: 'text/css'
      };
    }

    if (js && js.trim().length > 0) {
      files['script.js'] = {
        content: js.trim(),
        type: 'application/javascript'
      };
    }

    return files;
  }

  /**
   * Create a complete HTML page with embedded or linked CSS/JS
   * @private
   */
  private createFullHtmlPage(html: string, css: string, js: string) {
    const hasExternalCss = css && css.trim().length > 500;
    const hasExternalJs = js && js.trim().length > 500;

    const cssTag = hasExternalCss 
      ? '<link rel="stylesheet" href="styles.css">'
      : css ? `<style>${css}</style>` : '';

    const jsTag = hasExternalJs
      ? '<script src="script.js"></script>'
      : js ? `<script>${js}</script>` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Page</title>
    <script src="https://cdn.tailwindcss.com"></script>
    ${cssTag}
</head>
<body>
    ${html}
    ${jsTag}
</body>
</html>`;
  }

  /**
   * Generate SHA256 hash for file content
   * @private
   */
  private generateSHA256Hash(content: Buffer | string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Sanitize project name for CloudFlare Pages
   * @private
   */
  private sanitizeProjectName(name: string): string {
    // CloudFlare Pages project names must be:
    // - lowercase
    // - alphanumeric and hyphens only
    // - start and end with alphanumeric
    // - max 58 characters
    
    let sanitized = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
    
    // Ensure it starts and ends with alphanumeric
    if (!/^[a-z0-9]/.test(sanitized)) {
      sanitized = 'webmint-' + sanitized;
    }
    if (!/[a-z0-9]$/.test(sanitized)) {
      sanitized = sanitized + '-app';
    }
    
    // Truncate if too long
    if (sanitized.length > 58) {
      sanitized = sanitized.substring(0, 55) + '-app';
    }
    
    // Ensure minimum length
    if (sanitized.length < 3) {
      sanitized = 'webmint-' + sanitized + '-app';
    }
    
    return sanitized;
  }

  /**
   * Generate a unique project name based on timestamp and random string
   * @param prefix - Optional prefix for the project name
   * @returns Unique project name
   */
  static generateProjectName(prefix: string = 'webmint') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }
}

/**
 * Create CloudFlare Pages service instance from environment variables
 * @param env - Environment variables object
 * @returns Service instance or null if credentials missing
 */
export function createCloudFlarePagesService(env: Record<string, string | undefined>) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  console.log('Environment check:', { hasToken: !!apiToken, hasAccountId: !!accountId });
  
  if (!apiToken || !accountId) {
    console.error('Missing CloudFlare credentials: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID required');
    return null;
  }

  return new CloudFlarePagesService(apiToken, accountId);
}