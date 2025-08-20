import { json } from "@remix-run/cloudflare";
import { loadServerEnv } from "../utils/env.server";

export async function loader({ request, context }) {
  try {
    loadServerEnv();
    
    // Get CloudFlare credentials from environment
    const env = (context?.cloudflare?.env) || process.env;
    
    // Import CloudFlare service only on server-side
    const { createCloudFlarePagesService } = await import("../utils/cloudflare-pages.server");
    const cfService = createCloudFlarePagesService(env);
    console.log("cfService", cfService);
    if (!cfService) {
      return json({ 
        error: "CloudFlare credentials not configured. Please set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID" 
      }, { status: 500 });
    }

    // Get list of all pages
    const result = await cfService.listPages();

    if (result.success) {
      return json({
        success: true,
        projects: result.projects,
        total: result.projects.length
      });
    } else {
      return json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Pages list API error:', error);
    return json({ 
      success: false, 
      error: JSON.stringify(error.message)
    }, { status: 500 });
  }
}

export async function action({ request, context }) {
  try {
    loadServerEnv();
    
    const method = request.method;
    
    if (method === 'DELETE') {
      return await handleDelete(request, context);
    }
    
    return json({ error: "Method not allowed" }, { status: 405 });
    
  } catch (error) {
    console.error('Pages action API error:', error);
    return json({ 
      success: false, 
      error: JSON.stringify(error.message)
    }, { status: 500 });
  }
}

async function handleDelete(request, context) {
  const { projectName, deploymentId } = await request.json();
  
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

  let result;
  
  if (deploymentId) {
    // Delete specific deployment
    result = await cfService.deleteDeployment(projectName, deploymentId);
  } else {
    // Delete entire project
    result = await cfService.deletePage(projectName);
  }

  if (result.success) {
    return json({
      success: true,
      message: result.message
    });
  } else {
    return json({
      success: false,
      error: result.error
    }, { status: 500 });
  }
}
