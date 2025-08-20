import { json } from "@remix-run/cloudflare";
import { loadServerEnv } from "../utils/env.server";

export async function action({ request, context }) {
  try {
    loadServerEnv();
    
    const { html, css, js, projectName } = await request.json();
    
    // Validate required fields
    if (!html || typeof html !== "string" || html.trim().length === 0) {
      return json({ error: "Missing or invalid HTML content" }, { status: 400 });
    }

    // Get CloudFlare credentials from environment
    const env = (context?.cloudflare?.env) || process.env;
    
    // Import CloudFlare service only on server-side
    const { createCloudFlarePagesService, CloudFlarePagesService } = await import("../utils/cloudflare-pages.server");
    const cfService = createCloudFlarePagesService(env);
    
    if (!cfService) {
      return json({ 
        error: "CloudFlare credentials not configured. Please set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID" 
      }, { status: 500 });
    }

    // Generate project name if not provided
    const finalProjectName = projectName || CloudFlarePagesService.generateProjectName();

    // Prepare files for deployment
    const files = {
      html: html.trim(),
      css: (css || "").trim(),
      js: (js || "").trim()
    };

    // Deploy to CloudFlare Pages
    const result = await cfService.deployPage(finalProjectName, files);

    if (result.success) {
      return json({
        success: true,
        deployment: {
          id: result.deploymentId,
          url: result.url,
          projectName: result.projectName,
          createdAt: result.createdAt
        }
      });
    } else {
      return json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Deploy API error:', error);
    return json({ 
      success: false, 
      error: JSON.stringify(error.message)
    }, { status: 500 });
  }
}

// Handle GET requests to provide deployment status or information
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

    // Get project information
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
          latestDeployment: deployments.result[0] ? {
            id: deployments.result[0].id,
            url: deployments.result[0].url,
            status: deployments.result[0].latest_stage?.status || 'unknown',
            createdAt: deployments.result[0].created_on
          } : null
        }
      });

    } catch (error) {
      if (error.status === 404) {
        return json({ 
          success: false, 
          error: "Project not found" 
        }, { status: 404 });
      }
      throw error;
    }

  } catch (error) {
    console.error('Deploy loader error:', error);
    return json({ 
      success: false, 
      error: JSON.stringify(error.message)
    }, { status: 500 });
  }
}
