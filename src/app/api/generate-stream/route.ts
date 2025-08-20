import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  try {
    const { prompt, useStream = true } = await request.json();
    
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      console.log("Missing or invalid prompt");
      return NextResponse.json({ error: "Missing or invalid prompt" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log("OPENAI_API_KEY is not set");
      return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

    const client = new OpenAI({ apiKey });

    const systemInstruction = [
      // Output contract
      "You are a frontend code generator. Respond with STRICT JSON only. No prose, no markdown, no code fences.",
      'Response schema (must match exactly): { "html": string, "css": string, "js": string }',
      "The JSON must be valid and parseable.",
      "",
      // HTML rules
      "HTML (required):",
      "- Provide BODY-ONLY markup (do not include <html>, <head>, <body>).",
      "- Prefer horizontal layouts by default (e.g., toolbars, navbars, split panes).",
      "- Use semantic elements and accessibility best practices (labels, alt text, ARIA when appropriate).",
      "- Ensure responsive design using Tailwind responsive utilities.",
      "- Do NOT include <script> or <style> tags inside the HTML string.",
      "- Do NOT use third-party component libraries or class names (e.g., Preline, Flowbite, DaisyUI, Bootstrap, Shadcn).",
      "",
      // Styling rules
      "CSS (optional):",
      "- Use Tailwind utility classes for layout and styling only.",
      "- The host document already includes Tailwind via CDN; DO NOT add any Tailwind <script> tags in your output.",
      "- Only include minimal additional CSS when absolutely necessary (component-scoped).",
      "",
      // JS rules
      "JS (optional):",
      "- Vanilla JS only; self-contained; no external imports.",
      "- Attach behavior using addEventListener. Avoid inline onClick/onChange attributes if possible.",
      "- Keep logic minimal and focused on described interactions.",
      "",
      // Assets
      "Assets:",
      "- Avoid external images/fonts. Prefer inline SVGs or simple placeholders.",
      "",
      // Quality rubric
      "Quality rubric (must meet):",
      "- Visual: coherent palette, fluid type scale (e.g., clamp), consistent 4/8px spacing.",
      "- Composition: strong hierarchy, clear sections, balanced white space, smart use of grid/flex.",
      "- Responsiveness: thoughtful breakpoints (sm/md/lg), maintains rhythm and readability across sizes.",
      "- Polish: subtle transitions/hover states, depth via shadows/borders, occasional gradient or glass effect when suitable.",
      "- Accessibility: keyboard-focus styles, aria attributes where appropriate, sufficient color contrast.",
      "",
      // Formatting & safety
      "Formatting:",
      "- Keep code readable (no minification).",
      "- Do NOT include backticks, triple backticks, or any markdown artifacts in string values.",
      "- If a piece of code is unnecessary, omit it (e.g., empty css/js should be an empty string).",
      "",
      // Self-review
      "Before finalizing: validate output against the quality rubric. If something is lacking, improve it and then return the final JSON."
    ].join("\n");

    const userInstruction = [
      "Task: Generate a complete, expert-level marketing page for a fictional business.",
      "Constraints: Tailwind-only styling via host CDN; fully responsive; accessible; modern aesthetic; expert visual design quality.",
      "Implementation hints:",
      "- Clean, modern, professional aesthetic with refined spacing and typography.",
      "- Distinct sections with strong hierarchy and horizontal elements where appropriate (e.g., toolbars, split layouts).",
      "- Include a dark mode toggle in the header using Tailwind classes.",
      "- Use placeholders (inline SVGs or colored blocks) for media; include descriptive alt text.",
      "",
      "Recommended sections:",
      "- Header with logo, nav, CTA, and dark mode toggle.",
      "- Hero with headline, sub-headline, supporting visual, and primary CTA.",
      "- Features grid with icons and concise descriptions.",
      "- Testimonials (grid or simple carousel with controls).",
      "- About/Story with mission and small team avatars (placeholders).",
      "- Pricing (cards or table) with comparison highlights.",
      "- Contact (form fields and company info).",
      "- Footer with nav and social icons.",
      "",
      "User brief:",
      prompt
    ].join("\n\n");

    if (!useStream) {
      // Non-streaming response (fallback)
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userInstruction }
        ]
      });

      const raw = completion.choices?.[0]?.message?.content || "";
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: "Model returned invalid JSON", raw }, { status: 502 });
      }
      
      const { html, css, js } = payload || {};
      if (typeof html !== "string" || typeof css !== "string" || typeof js !== "string") {
        return NextResponse.json({ error: "Missing required fields in model response", payload }, { status: 502 });
      }
      
      return NextResponse.json({ 
        html, 
        css, 
        js,
        canDeploy: true,
        deployEndpoint: '/api/deploy'
      });
    }

    // Streaming response
    const stream = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      stream: true,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userInstruction }
      ]
    });

    const encoder = new TextEncoder();
    let accumulatedContent = "";
    let isComplete = false;

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial status
          const statusEvent = `data: ${JSON.stringify({ 
            type: 'status', 
            message: 'Starting code generation...', 
            progress: 0 
          })}\n\n`;
          controller.enqueue(encoder.encode(statusEvent));

          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            
            if (content) {
              accumulatedContent += content;
              
              // Send progress updates
              const progressEvent = `data: ${JSON.stringify({ 
                type: 'progress', 
                content: content,
                accumulated: accumulatedContent,
                progress: Math.min(95, accumulatedContent.length / 50) // Rough progress estimation
              })}\n\n`;
              controller.enqueue(encoder.encode(progressEvent));
            }

            // Check if stream is finished
            if (chunk.choices[0]?.finish_reason === 'stop') {
              isComplete = true;
              break;
            }
          }

          // Process final content
          if (isComplete && accumulatedContent) {
            try {
              const payload = JSON.parse(accumulatedContent);
              const { html, css, js } = payload || {};
              
              if (typeof html !== "string" || typeof css !== "string" || typeof js !== "string") {
                throw new Error("Missing required fields in model response");
              }

              // Send completion event
              const completionEvent = `data: ${JSON.stringify({ 
                type: 'complete', 
                html, 
                css, 
                js,
                canDeploy: true,
                deployEndpoint: '/api/deploy',
                progress: 100
              })}\n\n`;
              controller.enqueue(encoder.encode(completionEvent));

            } catch {
              // Send error event
              const errorEvent = `data: ${JSON.stringify({ 
                type: 'error', 
                error: 'Failed to parse generated JSON',
                raw: accumulatedContent
              })}\n\n`;
              controller.enqueue(encoder.encode(errorEvent));
            }
          } else {
            // Send error if incomplete
            const errorEvent = `data: ${JSON.stringify({ 
              type: 'error', 
              error: 'Stream ended unexpectedly'
            })}\n\n`;
            controller.enqueue(encoder.encode(errorEvent));
          }

          // Send final event to close connection
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();

        } catch (streamError: unknown) {
          console.error('Streaming error:', streamError);
          const errorEvent = `data: ${JSON.stringify({ 
            type: 'error', 
            error: streamError instanceof Error ? streamError.message : 'Streaming failed'
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
    console.error('Generate stream error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
