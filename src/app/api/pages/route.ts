import { NextResponse } from 'next/server';
import { createCloudFlarePagesService } from '@/lib/cloudflare-pages';

export async function GET() {
  try {
    // Get CloudFlare credentials from environment
    const cfService = createCloudFlarePagesService(process.env);
    
    if (!cfService) {
      return NextResponse.json({ 
        error: "CloudFlare credentials not configured. Please set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID" 
      }, { status: 500 });
    }

    // List all pages
    const result = await cfService.listPages();

    if (result.success) {
      return NextResponse.json({
        success: true,
        projects: result.projects
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

  } catch (error: unknown) {
    console.error('Pages list API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
