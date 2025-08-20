import Cloudflare from 'cloudflare';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

/**
 * CloudFlare Pages API Service
 * Handles deployment, listing, and deletion of pages
 */
export class CloudFlarePagesService {
  constructor(apiToken, accountId) {
    this.cf = new Cloudflare({ apiToken });
    this.apiToken = apiToken;
    this.accountId = accountId;
  }

  /**
   * Deploy a new page to CloudFlare Pages
   * @param {string} projectName - Name of the project (optional, will use default if not provided)
   * @param {Object} files - Object with file paths as keys and content as values
   * @param {string} files.html - HTML content
   * @param {string} files.css - CSS content  
   * @param {string} files.js - JavaScript content
   * @returns {Promise<Object>} Deployment result
   */
  async deployPage(projectName = null, files) {
    try {
      // Use a default project name for all WebMint deployments
      const defaultProjectName = 'webmint-app';
      const finalProjectName = projectName || defaultProjectName;
      
      // First, ensure the project exists
      let project;
      try {
        project = await this.cf.pages.projects.get(
          finalProjectName,
          { account_id: this.accountId },
        );
        console.log(`Using existing project: ${finalProjectName}`);
      } catch (error) {
        if (error.status === 404) {
          // Create new project if it doesn't exist
          console.log(`Creating new project: ${finalProjectName}`);
          project = await this.cf.pages.projects.create({
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

      // Debug: Log prepared files
      console.log('=== PREPARED FILES DEBUG ===');
      Object.entries(deploymentFiles).forEach(([fileName, fileData]) => {
        console.log(`${fileName}: ${fileData.content?.length || 0} chars`);
        console.log(`${fileName} preview:`, fileData.content?.substring(0, 200) || 'EMPTY');
      });

      // Create manifest
      const manifest = {};
      Object.keys(deploymentFiles).forEach(fileName => {
        if (deploymentFiles[fileName].content) {
          manifest[fileName] = {
            hash: this.generateFileHash(deploymentFiles[fileName].content)
          };
        }
      }); 

      console.log('Manifest:', manifest);

      // Create local backup and ZIP for verification
      const { backupPath, zipBuffer } = await this.createLocalBackupAndZip(deploymentFiles, finalProjectName);
      console.log('Backup created at:', backupPath);
      console.log('ZIP backup size:', zipBuffer.length, 'bytes');
      
      // Use SDK-style method with physical files (inspired by @cloudflare/pages-deploy)
      console.log('Deploying with SDK-style method using physical files...');
      return await this.deployWithSDK(backupPath, finalProjectName, deploymentFiles);
    } catch (error) {
      console.error('CloudFlare Pages deployment error:', error);
      return {
        success: false,
        error: error.message || 'Failed to deploy page'
      };
    }
  }

  /**
   * Deploy using CloudFlare SDK with physical files (inspired by pages-deploy)
   * @param {string} backupPath - Path to backup directory with files
   * @param {string} projectName - Project name
   * @param {Object} deploymentFiles - Files metadata
   * @returns {Promise<Object>} Deployment result
   */
  async deployWithSDK(backupPath, projectName, deploymentFiles) {
    try {
      console.log('=== SDK DEPLOYMENT WITH PHYSICAL FILES ===');
      
      // 1. Verify files exist in backup directory
      const files = await fs.promises.readdir(backupPath);
      console.log('Files in backup directory:', files);
      
      if (!files.includes('index.html')) {
        throw new Error('index.html not found in backup directory');
      }

      // 2. Prepare manifest using file hashes from physical files
      const manifest = {};
      for (const fileName of Object.keys(deploymentFiles)) {
        try {
          const filePath = path.join(backupPath, fileName);
          const fileContent = await fs.promises.readFile(filePath);
          manifest[fileName] = {
            hash: this.generateFileHash(fileContent.toString())
          };
          console.log(`Added ${fileName} to manifest: ${fileContent.length} bytes`);
        } catch (error) {
          console.log(`Warning: Could not add ${fileName} to manifest:`, error.message);
        }
      }

      console.log('Manifest created:', manifest);

      // 3. Prepare files as FormData using physical files (SDK-like approach)
      const formData = new FormData();
      
      // Add manifest
      formData.append('manifest', JSON.stringify(manifest));
      
      // Add each physical file
      for (const fileName of Object.keys(deploymentFiles)) {
        try {
          const filePath = path.join(backupPath, fileName);
          const fileBuffer = await fs.promises.readFile(filePath);
          
          console.log(`Adding physical file ${fileName}: ${fileBuffer.length} bytes`);
          
          // Create blob from physical file buffer
          const blob = new Blob([fileBuffer], { 
            type: deploymentFiles[fileName].type || 'application/octet-stream'
          });
          
          formData.append(fileName, blob, fileName);
        } catch (error) {
          console.error(`Error adding physical file ${fileName}:`, error);
        }
      }

      // 4. Deploy using direct API call with physical files
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/pages/projects/${projectName}/deployments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.log("SDK-style API Error:", errorData);
        throw new Error(`SDK-style API Error: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      const deployment = await response.json();

      return {
        success: true,
        deploymentId: deployment.result.id,
        url: deployment.result.url,
        projectName: projectName,
        createdAt: deployment.result.created_on,
        method: 'sdk-style'
      };

    } catch (error) {
      console.error('SDK-style deployment error:', error);
      return {
        success: false,
        error: error.message || 'SDK-style deployment failed'
      };
    }
  }

  /**
   * Deploy using Wrangler CLI with physical files
   * @param {string} backupPath - Path to backup directory with files
   * @param {string} projectName - Project name
   * @returns {Promise<Object>} Deployment result
   */
  async deployWithWrangler(backupPath, projectName) {
    const execAsync = promisify(exec);
    
    try {
      // Verify files exist in backup directory
      const files = await fs.promises.readdir(backupPath);
      console.log('Files in backup directory:', files);
      
      if (!files.includes('index.html')) {
        throw new Error('index.html not found in backup directory');
      }

      // Set up Wrangler environment variables
      const wranglerEnv = {
        ...process.env,
        CLOUDFLARE_API_TOKEN: this.apiToken,
        CLOUDFLARE_ACCOUNT_ID: this.accountId
      };

      // Deploy using Wrangler CLI
      const deployCommand = `npx wrangler pages deploy "${backupPath}" --project-name="${projectName}"`;
      console.log(`Running: ${deployCommand}`);
      
      const { stdout, stderr } = await execAsync(deployCommand, { 
        env: wranglerEnv,
        cwd: process.cwd(),
        timeout: 120000 // 2 minutes timeout
      });

      console.log('Wrangler stdout:', stdout);
      if (stderr) console.log('Wrangler stderr:', stderr);

      // Parse Wrangler output to extract deployment URL
      const urlMatch = stdout.match(/https:\/\/[a-f0-9]+\.[^.\s]+\.pages\.dev/);
      const deploymentUrl = urlMatch ? urlMatch[0] : null;
      
      if (!deploymentUrl) {
        throw new Error('Could not extract deployment URL from Wrangler output');
      }

      return {
        success: true,
        deploymentId: `wrangler-${Date.now()}`,
        url: deploymentUrl,
        projectName: projectName,
        createdAt: new Date().toISOString(),
        method: 'wrangler'
      };

    } catch (error) {
      console.error('Wrangler deployment error:', error);
      return {
        success: false,
        error: error.message || 'Wrangler deployment failed'
      };
    }
  }

  /**
   * Deploy using CloudFlare API (fallback method)
   * @param {Object} deploymentFiles - Files to deploy
   * @param {string} projectName - Project name
   * @param {Object} manifest - File manifest
   * @param {string} backupPath - Path to backup directory with physical files
   * @returns {Promise<Object>} Deployment result
   */
  async deployWithAPI(deploymentFiles, projectName, manifest, backupPath = null) {
    try {
      const formData = new FormData();
      
      // Add manifest as JSON string
      formData.append('manifest', JSON.stringify(manifest));
      
      // Add each file - try to read from physical backup first, then fallback to memory
      for (const [fileName, fileData] of Object.entries(deploymentFiles)) {
        let fileContent;
        let contentSource = 'memory';

        // Try to read from physical backup file if available
        if (backupPath) {
            try {
                // LEE EL ARCHIVO COMO UN BUFFER, NO COMO STRING 'utf8'
                const physicalContent = await fs.promises.readFile(path.join(backupPath, fileName)); 
                fileContent = physicalContent;
                contentSource = 'physical';
                console.log(`Using physical file for ${fileName}: ${fileContent.length} bytes`);
            } catch (error) {
                console.log(`Physical file not found for ${fileName}, using memory content`);
                fileContent = fileData.content;
            }
        } else {
            fileContent = fileData.content;
        }
        
        console.log(`Adding ${fileName} to FormData from ${contentSource}: ${fileContent.length} bytes`);
        
        // Create blob from the Buffer
        const blob = new Blob([fileContent], { 
          type: fileData.type || 'application/octet-stream'
        });
        
        formData.append(fileName, blob, fileName);
      }
      
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/pages/projects/${projectName}/deployments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.log("CloudFlare API Error:", errorData);
        throw new Error(`CloudFlare API Error: ${errorData.errors?.[0]?.message || response.statusText}`);
      }
      
      const deployment = await response.json();

      return {
        success: true,
        deploymentId: deployment.result.id,
        url: deployment.result.url,
        projectName: projectName,
        createdAt: deployment.result.created_on,
        method: 'api'
      };

    } catch (error) {
      console.error('API deployment error:', error);
      return {
        success: false,
        error: error.message || 'API deployment failed'
      };
    }
  }

  /**
   * List all projects and their deployments
   * @returns {Promise<Array>} List of projects with their deployments
   */
  async listPages() {
    try {
      const projects = await this.cf.pages.projects.list({
        account_id: this.accountId
      });

      const projectsWithDeployments = await Promise.all(
        projects.result.map(async (project) => {
          try {
            const deployments = await this.cf.pages.projects.deployments.list({
              account_id: this.accountId,
              project_name: project.name
            });

            return {
              id: project.id,
              name: project.name,
              domain: project.canonical_deployment?.url || null,
              createdAt: project.created_on,
              deployments: deployments.result.slice(0, 5).map(deployment => ({
                id: deployment.id,
                url: deployment.url,
                status: deployment.latest_stage?.status || 'unknown',
                createdAt: deployment.created_on
              }))
            };
          } catch (error) {
            console.error(`Error fetching deployments for ${project.name}:`, error);
            return {
              id: project.id,
              name: project.name,
              domain: project.canonical_deployment?.url || null,
              createdAt: project.created_on,
              deployments: []
            };
          }
        })
      );

      return {
        success: true,
        projects: projectsWithDeployments
      };
    } catch (error) {
      console.error('CloudFlare Pages list error:', error);
      return {
        success: false,
        error: error.message || 'Failed to list pages'
      };
    }
  }

  /**
   * Delete a project and all its deployments
   * @param {string} projectName - Name of the project to delete
   * @returns {Promise<Object>} Deletion result
   */
  async deletePage(projectName) {
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
    } catch (error) {
      console.error('CloudFlare Pages deletion error:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete page'
      };
    }
  }

  /**
   * Delete a specific deployment
   * @param {string} projectName - Name of the project
   * @param {string} deploymentId - ID of the deployment to delete
   * @returns {Promise<Object>} Deletion result
   */
  async deleteDeployment(projectName, deploymentId) {
    try {
      await this.cf.pages.projects.deployments.delete(
        projectName,
        deploymentId,
        {
          account_id: this.accountId,
        }
      );

      return {
        success: true,
        message: `Deployment ${deploymentId} deleted successfully`
      };
    } catch (error) {
      console.error('CloudFlare Pages deployment deletion error:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete deployment'
      };
    }
  }

  /**
   * Prepare files for CloudFlare Pages deployment
   * @private
   */
  prepareDeploymentFiles({ html, css, js }) {
    const files = {};

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
  createFullHtmlPage(html, css, js) {
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
   * Generate a simple hash for file content
   * @private
   */
  generateFileHash(content) {
    let hash = 0; 
    if (content.length === 0) return hash.toString();
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Download deployment files for verification
   * @param {string} projectName - Name of the project
   * @param {string} deploymentId - ID of the deployment
   * @returns {Promise<Object>} Object containing file contents
   */
  async downloadDeploymentFiles(projectName = 'webmint-app', deploymentId = null) {
    try {
      console.log('downloadDeploymentFiles called with:', { projectName, deploymentId });
      console.log('Account ID:', this.accountId);
      
      // If no deploymentId provided, get the latest deployment
      if (!deploymentId) {
        console.log('Getting deployments for project:', projectName);
        const deployments = await this.cf.pages.projects.deployments.list({
          account_id: this.accountId,
          project_name: projectName
        });

        console.log('Deployments response:', deployments);

        if (!deployments.result || deployments.result.length === 0) {
          return {
            success: false,
            error: `No deployments found for project ${projectName}. Please deploy something first.`,
            projectName: projectName,
            deploymentCount: 0
          };
        }

        deploymentId = deployments.result[0].id;
        console.log('Using deployment ID:', deploymentId);
      }

      // Get deployment details
      const deployment = await this.cf.pages.projects.deployments.get(
        projectName,
        deploymentId,
        {
          account_id: this.accountId
        }
      );

      if (!deployment.result) {
        throw new Error('Deployment not found');
      }

      // Try to fetch files from the deployment URL
      const baseUrl = deployment.result.url;
      const files = {};

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
        } catch (error) {
          console.log(`Could not fetch ${fileName}:`, error.message);
        }
      }

      return {
        success: true,
        deploymentId: deploymentId,
        deploymentUrl: baseUrl,
        files: files,
        fileCount: Object.keys(files).length
      };

    } catch (error) {
      console.error('Download deployment files error:', error);
      return {
        success: false,
        error: error.message || 'Failed to download deployment files'
      };
    }
  }

  /**
   * Create local backup of deployment files and return ZIP buffer
   * @param {Object} deploymentFiles - Files to backup
   * @param {string} projectName - Project name for backup folder
   * @returns {Promise<{backupPath: string, zipBuffer: Buffer}>} Backup path and ZIP buffer
   */
  async createLocalBackupAndZip(deploymentFiles, projectName) {
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
      
      // Create manifest file for reference
      const manifestPath = path.join(backupDir, 'manifest.json');
      const manifestData = {
        projectName,
        timestamp: new Date().toISOString(),
        files: Object.keys(deploymentFiles),
        fileSizes: Object.fromEntries(
          Object.entries(deploymentFiles).map(([name, data]) => [name, data.content.length])
        )
      };
      await fs.promises.writeFile(manifestPath, JSON.stringify(manifestData, null, 2));
      
      return {
        backupPath: backupDir,
        zipBuffer: zipBuffer
      };
    } catch (error) {
      console.error('Failed to create local backup:', error);
      throw error;
    }
  }

  /**
   * Generate a unique project name based on timestamp and random string
   * @param {string} prefix - Optional prefix for the project name
   * @returns {string} Unique project name
   */
  static generateProjectName(prefix = 'webmint') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }
}

/**
 * Create CloudFlare Pages service instance from environment variables
 * @param {Object} env - Environment variables object
 * @returns {CloudFlarePagesService|null} Service instance or null if credentials missing
 */
export function createCloudFlarePagesService(env) {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  console.log('apiToken', env);
  console.log('accountId', env);
  if (!apiToken || !accountId) {
    console.error('Missing CloudFlare credentials: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID required');
    return null;
  }

  return new CloudFlarePagesService(apiToken, accountId);
}
