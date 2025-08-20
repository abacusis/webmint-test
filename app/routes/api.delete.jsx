import { json } from "@remix-run/cloudflare";
import { loadServerEnv } from "../utils/env.server";

export async function action({ request, context }) {
  try {
    loadServerEnv();
    
    if (request.method !== 'DELETE' && request.method !== 'POST') {
      return json({ error: "Method not allowed. Use DELETE or POST" }, { status: 405 });
    }
    
    const { projectName, deploymentId, type } = await request.json();
    
    if (!projectName) {
      return json({ error: "Project name is required" }, { status: 400 });
    }

    // Get CloudFlare credentials from environment
    const env = (context?.cloudflare?.env) || process.env;
    
    // Import CloudFlare service only on server-side
    const { createCloudFlarePagesService } = await import("../utils/cloudflare-pages.server");
    const cfService = createCloudFlarePagesService(env);
    
    if (!cfService) {
      return json({ 
        error: "CloudFlare credentials not configured. Please set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID" 
      }, { status: 500 });
    }

    let result;
    
    if (type === 'deployment' && deploymentId) {
      // Delete specific deployment
      result = await cfService.deleteDeployment(projectName, deploymentId);
    } else if (type === 'project' || !deploymentId) {
      // Delete entire project (default behavior)
      result = await cfService.deletePage(projectName);
    } else {
      return json({ 
        error: "Invalid deletion type. Use 'project' or 'deployment' with deploymentId" 
      }, { status: 400 });
    }

    if (result.success) {
      return json({
        success: true,
        message: result.message,
        deletedProject: type === 'project' ? projectName : null,
        deletedDeployment: type === 'deployment' ? deploymentId : null
      });
    } else {
      return json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Delete API error:', error);
    return json({ 
      success: false, 
      error: JSON.stringify(error.message)
    }, { status: 500 });
  }
}

// Handle GET requests to provide deletion confirmation or project status
export async function loader({ request, context }) {
  try {
    loadServerEnv();
    
    const url = new URL(request.url);
    const projectName = url.searchParams.get('project');
    
    if (!projectName) {
      return json({ error: "Project name is required" }, { status: 400 });
    }

    // Get CloudFlare credentials from environment
    const env = (context?.cloudflare?.env) || process.env;
    
    // Import CloudFlare service only on server-side
    const { createCloudFlarePagesService } = await import("../utils/cloudflare-pages.server");
    const cfService = createCloudFlarePagesService(env);
    
    if (!cfService) {
      return json({ 
        error: "CloudFlare credentials not configured" 
      }, { status: 500 });
    }

    // Check if project exists before deletion
    try {
      const project = await cfService.cf.pages.projects.get({
        account_id: cfService.accountId,
        project_name: projectName
      });

      const deployments = await cfService.cf.pages.projects.deployments.list({
        account_id: cfService.accountId,
        project_name: projectName
      });

      return json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          domain: project.canonical_deployment?.url || null,
          createdAt: project.created_on,
          deploymentsCount: deployments.result.length,
          deployments: deployments.result.map(deployment => ({
            id: deployment.id,
            url: deployment.url,
            status: deployment.latest_stage?.status || 'unknown',
            createdAt: deployment.created_on
          }))
        },
        canDelete: true
      });

    } catch (error) {
      if (error.status === 404) {
        return json({ 
          success: false, 
          error: "Project not found or already deleted",
          canDelete: false
        }, { status: 404 });
      }
      throw error;
    }

  } catch (error) {
    return json({ 
      success: false, 
      error: JSON.stringify(error.message)
    }, { status: 500 });
  }
}
