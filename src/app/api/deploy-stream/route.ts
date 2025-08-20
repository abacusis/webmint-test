import { NextRequest, NextResponse } from 'next/server';
import { createCloudFlarePagesService, CloudFlarePagesService } from '@/lib/cloudflare-pages';

export async function POST(request: NextRequest) {
  try {
    const { html, css, js, projectName, projectAlias } = await request.json();
    
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

    const encoder = new TextEncoder();
    
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial status
          const statusEvent = `data: ${JSON.stringify({ 
            type: 'status', 
            message: 'Preparing deployment...', 
            progress: 10 
          })}\n\n`;
          controller.enqueue(encoder.encode(statusEvent));

          // Use projectAlias if provided, otherwise use projectName or generate one
          const finalProjectName = projectAlias || projectName || CloudFlarePagesService.generateProjectName();

          // Send progress
          const prepEvent = `data: ${JSON.stringify({ 
            type: 'status', 
            message: `Deploying to project: ${finalProjectName}`, 
            progress: 30,
            projectName: finalProjectName
          })}\n\n`;
          controller.enqueue(encoder.encode(prepEvent));

          // Prepare files for deployment
          const files = {
            html: html.trim(),
            css: (css || "").trim(),
            js: (js || "").trim()
          };

          // Send progress
          const deployEvent = `data: ${JSON.stringify({ 
            type: 'status', 
            message: 'Uploading files to CloudFlare...', 
            progress: 60,
            projectName: finalProjectName
          })}\n\n`;
          controller.enqueue(encoder.encode(deployEvent));

          // Deploy to CloudFlare Pages
          const result = await cfService.deployPage(finalProjectName, files);

          if (result.success) {
            // Send completion event
            const completionEvent = `data: ${JSON.stringify({ 
              type: 'complete', 
              success: true,
              deployment: {
                id: result.deploymentId,
                url: result.url,
                projectName: result.projectName,
                createdAt: result.createdAt
              },
              message: 'Deployment completed successfully!',
              progress: 100
            })}\n\n`;
            controller.enqueue(encoder.encode(completionEvent));
          } else {
            // Send error event
            const errorEvent = `data: ${JSON.stringify({ 
              type: 'error', 
              error: result.error
            })}\n\n`;
            controller.enqueue(encoder.encode(errorEvent));
          }

          // Send final event to close connection
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();

        } catch (streamError: unknown) {
          console.error('Deploy streaming error:', streamError);
          const errorEvent = `data: ${JSON.stringify({ 
            type: 'error', 
            error: streamError instanceof Error ? streamError.message : 'Deployment failed'
          })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
          controller.close();
        }
      }
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });

  } catch (e: unknown) {
    console.error('Deploy stream error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
