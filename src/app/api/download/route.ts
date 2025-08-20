import { NextRequest, NextResponse } from 'next/server';
import { createCloudFlarePagesService } from '@/lib/cloudflare-pages';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectName = searchParams.get('project') || 'webmint-app';
    const deploymentId = searchParams.get('deployment');
    const fileName = searchParams.get('file');

    // Get CloudFlare credentials from environment
    const cfService = createCloudFlarePagesService(process.env);
    
    if (!cfService) {
      return NextResponse.json({ 
        error: "CloudFlare credentials not configured. Please set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID" 
      }, { status: 500 });
    }

    // Download deployment files
    const result = await cfService.downloadDeploymentFiles(projectName, deploymentId);

    if (result.success && result.files) {
      if (fileName && result.files[fileName]) {
        // Return specific file
        return NextResponse.json({
          success: true,
          file: {
            name: fileName,
            content: result.files[fileName].content,
            size: result.files[fileName].size,
            type: result.files[fileName].type
          }
        });
      } else {
        // Return all files
        return NextResponse.json({
          success: true,
          deploymentId: result.deploymentId,
          deploymentUrl: result.deploymentUrl,
          files: result.files,
          fileCount: result.fileCount
        });
      }
    } else {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

  } catch (error: unknown) {
    console.error('Download API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    if (action !== 'download') {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return GET(request);
  } catch (error: unknown) {
    console.error('Download POST API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
