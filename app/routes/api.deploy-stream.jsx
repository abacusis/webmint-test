import { loadServerEnv } from "../utils/env.server";

export async function action({ request, context }) {
  try {
    loadServerEnv();
    
    const { html, css, js, projectName = null } = await request.json();
    
    // Validate required fields
    if (!html || typeof html !== "string" || html.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Missing or invalid HTML content" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Get CloudFlare credentials from environment
    const env = (context?.cloudflare?.env) || process.env;
    
    // Import CloudFlare service only on server-side
    const { createCloudFlarePagesService } = await import("../utils/cloudflare-pages.server");
    const cfService = createCloudFlarePagesService(env);

    if (!cfService) {
      return new Response(JSON.stringify({ 
        error: "CloudFlare credentials not configured. Please set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID" 
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Use default project name (will be handled by the service)
    const finalProjectName = projectName;

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial status
          const statusEvent = `data: ${JSON.stringify({ 
            type: 'status', 
            message: 'Preparing deployment...', 
            progress: 10,
            projectName: finalProjectName
          })}\n\n`;
          controller.enqueue(encoder.encode(statusEvent));

          // Prepare files for deployment
          const files = {
            html: html.trim(),
            css: (css || "").trim(),
            js: (js || "").trim()
          };

          // Send file preparation status
          const prepareEvent = `data: ${JSON.stringify({ 
            type: 'status', 
            message: 'Files prepared, checking CloudFlare project...', 
            progress: 30
          })}\n\n`;
          controller.enqueue(encoder.encode(prepareEvent));

          // Check if project exists
          let projectExists = false;
          try {
            await cfService.cf.pages.projects.get({
              account_id: cfService.accountId,
              project_name: finalProjectName
            });
            projectExists = true;
            
            const existsEvent = `data: ${JSON.stringify({ 
              type: 'status', 
              message: `Project ${finalProjectName} exists, updating...`, 
              progress: 50
            })}\n\n`;
            controller.enqueue(encoder.encode(existsEvent));
            
          } catch (error) {
            if (error.status === 404) {
              const createEvent = `data: ${JSON.stringify({ 
                type: 'status', 
                message: `Creating new project ${finalProjectName}...`, 
                progress: 50
              })}\n\n`;
              controller.enqueue(encoder.encode(createEvent));
            }
          }

          // Send deployment status
          const deployEvent = `data: ${JSON.stringify({ 
            type: 'status', 
            message: 'Uploading files to CloudFlare Pages...', 
            progress: 70
          })}\n\n`;
          controller.enqueue(encoder.encode(deployEvent));

          // Deploy to CloudFlare Pages
          const result = await cfService.deployPage(finalProjectName, files);

          if (result.success) {
            // Send processing status
            const processEvent = `data: ${JSON.stringify({ 
              type: 'status', 
              message: 'Deployment uploaded, processing...', 
              progress: 85
            })}\n\n`;
            controller.enqueue(encoder.encode(processEvent));

            // Wait a bit for deployment to process
            await new Promise(resolve => setTimeout(resolve, 2000));

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
              progress: 100,
              message: 'Deployment completed successfully!'
            })}\n\n`;
            controller.enqueue(encoder.encode(completionEvent));

          } else {
            // Send error event
            const errorEvent = `data: ${JSON.stringify({ 
              type: 'error',
              success: false,
              error: result.error,
              progress: 0
            })}\n\n`;
            controller.enqueue(encoder.encode(errorEvent));
          }

          // Send final event to close connection
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();

        } catch (streamError) {
          console.error('Deployment streaming error:', streamError);
          const errorEvent = `data: ${JSON.stringify({ 
            type: 'error',
            success: false,
            error: streamError.message || 'Deployment streaming failed'
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

  } catch (error) {
    console.error('Deploy stream error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
