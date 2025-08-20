import { NextRequest, NextResponse } from 'next/server';
import { createCloudFlarePagesService, CloudFlarePagesService } from '@/lib/cloudflare-pages';

export async function POST(request: NextRequest) {
  try {
    const { html, css, js, projectName, projectAlias } = await request.json();
    
    // Debug: Log received files
    console.log('=== DEPLOY API DEBUG ===');
    console.log('HTML length:', html?.length || 0);
    console.log('CSS length:', css?.length || 0);
    console.log('JS length:', js?.length || 0);
    console.log('HTML preview:', html?.substring(0, 100) || 'EMPTY');
    
    // Validate required fields
    if (!html || typeof html !== "string" || html.trim().length === 0) {
      return NextResponse.json({ error: "Missing or invalid HTML content" }, { status: 400 });
    }
    
    if (!projectAlias || typeof projectAlias !== "string" || projectAlias.trim().length === 0) {
      return NextResponse.json({ error: "Project name is required to avoid creating too many projects" }, { status: 400 });
    }

    // Get CloudFlare credentials from environment
    const cfService = createCloudFlarePagesService(process.env);
    
    if (!cfService) {
      return NextResponse.json({ 
        error: "CloudFlare credentials not configured. Please set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID" 
      }, { status: 500 });
    }

    // Use projectAlias if provided, otherwise use projectName or generate one
    const finalProjectName = projectAlias || projectName || CloudFlarePagesService.generateProjectName();
    
    console.log('Project naming:', { projectAlias, projectName, finalProjectName });

    // Prepare files for deployment
    const files = {
      html: html.trim(),
      css: (css || "").trim(),
      js: (js || "").trim()
    };

    // Deploy to CloudFlare Pages
    const result = await cfService.deployPage(finalProjectName, files);

    if (result.success) {
      return NextResponse.json({
        success: true,
        deployment: {
          id: result.deploymentId,
          url: result.url,
          projectName: result.projectName,
          createdAt: result.createdAt
        }
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

  } catch (error: unknown) {
    console.error('Deploy API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Handle GET requests to provide deployment status or information
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectName = searchParams.get('project');
    
    if (!projectName) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    // Get CloudFlare credentials from environment
    const cfService = createCloudFlarePagesService(process.env);
    
    if (!cfService) {
      return NextResponse.json({ 
        error: "CloudFlare credentials not configured" 
      }, { status: 500 });
    }

    // Get project information
    try {
      // Type assertion for CloudFlare service internal properties
      const cfServiceInternal = cfService as unknown as {
        cf: {
          pages: {
            projects: {
              get: (name: string, options: { account_id: string }) => Promise<{ result: { id: string; name: string; canonical_deployment?: { url: string }; created_on: string } }>;
              deployments: {
                list: (name: string, options: { account_id: string }) => Promise<{ result: { id: string; url: string; latest_stage?: { status: string }; created_on: string }[] }>;
              };
            };
          };
        };
        accountId: string;
      };

      const project = await cfServiceInternal.cf.pages.projects.get(
        projectName,
        { account_id: cfServiceInternal.accountId }
      );

      const deployments = await cfServiceInternal.cf.pages.projects.deployments.list(
        projectName,
        { account_id: cfServiceInternal.accountId }
      );

      return NextResponse.json({
        success: true,
        project: {
          id: project.result.id,
          name: project.result.name,
          domain: project.result.canonical_deployment?.url || null,
          createdAt: project.result.created_on,
          latestDeployment: deployments.result[0] ? {
            id: deployments.result[0].id,
            url: deployments.result[0].url,
            status: deployments.result[0].latest_stage?.status || 'unknown',
            createdAt: deployments.result[0].created_on
          } : null
        }
      });

    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        return NextResponse.json({ 
          success: false, 
          error: "Project not found" 
        }, { status: 404 });
      }
      throw error;
    }

  } catch (error: unknown) {
    console.error('Deploy loader error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
