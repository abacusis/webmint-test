import { json } from "@remix-run/cloudflare";
import { loadServerEnv } from "../utils/env.server";

/**
 * Download deployment files from CloudFlare Pages
 * GET /api/download?projectName=webmint-app&deploymentId=123&fileName=index.html
 * POST /api/download with { projectName?, deploymentId?, fileName? }
 */
export async function loader({ request, context }) {
  try {
    loadServerEnv();
    
    const url = new URL(request.url);
    const projectName = url.searchParams.get('projectName') || 'webmint-app';
    const deploymentId = url.searchParams.get('deploymentId');
    const fileName = url.searchParams.get('fileName');

    // Get CloudFlare credentials from environment
    const env = process.env;
    
    // Dynamic import to avoid build issues
    const { createCloudFlarePagesService } = await import('../utils/cloudflare-pages.server.js');
    const cfService = createCloudFlarePagesService(env);

    if (!cfService) {
      return json({ error: 'CloudFlare service not available' }, { status: 500 });
    }

    if (fileName) {
      // Download specific file
      const result = await cfService.downloadDeploymentFiles(projectName, deploymentId);
      
      if (!result.success) {
        return json({ error: result.error }, { status: 400 });
      }

      const file = result.files[fileName];
      if (!file) {
        return json({ error: `File ${fileName} not found` }, { status: 404 });
      }

      // Return file content for download
      return new Response(file.content, {
        headers: {
          'Content-Type': file.type,
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': file.size.toString()
        }
      });
    } else {
      // Return file list and metadata
      const result = await cfService.downloadDeploymentFiles(projectName, deploymentId);
      return json(result);
    }

  } catch (error) {
    console.error('Download API error:', error);
    return json({ 
      error: error.message || 'Failed to download files',
      details: error.stack 
    }, { status: 500 });
  }
}

export async function action({ request, context }) {
  try {
    loadServerEnv();
    
    const body = await request.json();
    const { projectName = 'webmint-app', deploymentId, fileName, action: actionType } = body;

    // Get CloudFlare credentials from environment
    const env = process.env;
    
    // Dynamic import to avoid build issues
    const { createCloudFlarePagesService } = await import('../utils/cloudflare-pages.server.js');
    const cfService = createCloudFlarePagesService(env);

    if (!cfService) {
      return json({ error: 'CloudFlare service not available' }, { status: 500 });
    }

    switch (actionType) {
      case 'download':
        const result = await cfService.downloadDeploymentFiles(projectName, deploymentId);
        
        if (!result.success) {
          return json({ error: result.error }, { status: 400 });
        }

        if (fileName) {
          const file = result.files[fileName];
          if (!file) {
            return json({ error: `File ${fileName} not found` }, { status: 404 });
          }

          return json({
            success: true,
            file: {
              name: fileName,
              content: file.content,
              size: file.size,
              type: file.type
            }
          });
        }

        return json(result);

      case 'list':
        const listResult = await cfService.downloadDeploymentFiles(projectName, deploymentId);
        
        if (!listResult.success) {
          return json({ error: listResult.error }, { status: 400 });
        }

        // Return only metadata, not full content
        const fileList = Object.entries(listResult.files).map(([name, file]) => ({
          name,
          size: file.size,
          type: file.type
        }));

        return json({
          success: true,
          deploymentId: listResult.deploymentId,
          deploymentUrl: listResult.deploymentUrl,
          files: fileList,
          fileCount: listResult.fileCount
        });

      default:
        return json({ error: 'Invalid action. Use "download" or "list"' }, { status: 400 });
    }

  } catch (error) {
    console.error('Download API action error:', error);
    return json({ 
      error: error.message || 'Failed to process download request',
      details: error.stack 
    }, { status: 500 });
  }
}
