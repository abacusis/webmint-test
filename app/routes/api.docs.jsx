import { json } from "@remix-run/cloudflare";

export async function loader() {
  const apiDocumentation = {
    title: "WebMint CloudFlare Pages API",
    version: "1.0.0",
    description: "API for generating HTML/CSS/JS content and deploying to CloudFlare Pages",
    baseUrl: "/api",
    endpoints: {
      "/api/generate": {
        method: "POST",
        description: "Generate HTML, CSS, and JavaScript content using OpenAI",
        requestBody: {
          prompt: "string - Description of the page to generate"
        },
        response: {
          html: "string - Generated HTML content",
          css: "string - Generated CSS content", 
          js: "string - Generated JavaScript content",
          canDeploy: "boolean - Whether deployment is available",
          deployEndpoint: "string - Endpoint for deployment"
        },
        example: {
          request: {
            prompt: "Create a modern landing page for a tech startup"
          },
          response: {
            html: "<div class='container'>...</div>",
            css: ".container { ... }",
            js: "document.addEventListener('DOMContentLoaded', ...)",
            canDeploy: true,
            deployEndpoint: "/api/deploy"
          }
        }
      },
      "/api/deploy": {
        method: "POST",
        description: "Deploy generated content to CloudFlare Pages",
        requestBody: {
          html: "string - HTML content to deploy (required)",
          css: "string - CSS content to deploy (optional)",
          js: "string - JavaScript content to deploy (optional)",
          projectName: "string - Custom project name (optional, auto-generated if not provided)"
        },
        response: {
          success: "boolean - Deployment success status",
          deployment: {
            id: "string - Deployment ID",
            url: "string - Live URL of deployed page",
            projectName: "string - Project name used",
            createdAt: "string - ISO timestamp of creation"
          }
        },
        example: {
          request: {
            html: "<div class='container'>Hello World</div>",
            css: ".container { padding: 20px; }",
            js: "console.log('Page loaded');",
            projectName: "my-awesome-site"
          },
          response: {
            success: true,
            deployment: {
              id: "abc123def456",
              url: "https://my-awesome-site.pages.dev",
              projectName: "my-awesome-site",
              createdAt: "2024-01-01T12:00:00Z"
            }
          }
        }
      },
      "/api/deploy (GET)": {
        method: "GET",
        description: "Get information about a specific project",
        queryParams: {
          project: "string - Project name to get information for"
        },
        response: {
          success: "boolean - Request success status",
          project: {
            id: "string - Project ID",
            name: "string - Project name",
            domain: "string - Project domain URL",
            createdAt: "string - ISO timestamp",
            latestDeployment: {
              id: "string - Latest deployment ID",
              url: "string - Latest deployment URL",
              status: "string - Deployment status",
              createdAt: "string - ISO timestamp"
            }
          }
        }
      },
      "/api/pages": {
        method: "GET", 
        description: "List all deployed pages and projects",
        response: {
          success: "boolean - Request success status",
          projects: [
            {
              id: "string - Project ID",
              name: "string - Project name",
              domain: "string - Project domain URL",
              createdAt: "string - ISO timestamp",
              deployments: [
                {
                  id: "string - Deployment ID",
                  url: "string - Deployment URL",
                  status: "string - Deployment status",
                  createdAt: "string - ISO timestamp"
                }
              ]
            }
          ],
          total: "number - Total number of projects"
        }
      },
      "/api/delete": {
        method: "DELETE or POST",
        description: "Delete a project or specific deployment",
        requestBody: {
          projectName: "string - Name of project to delete (required)",
          deploymentId: "string - Specific deployment ID (optional)",
          type: "string - 'project' or 'deployment' (required if deploymentId provided)"
        },
        response: {
          success: "boolean - Deletion success status",
          message: "string - Success message",
          deletedProject: "string - Name of deleted project (if applicable)",
          deletedDeployment: "string - ID of deleted deployment (if applicable)"
        },
        example: {
          deleteProject: {
            request: {
              projectName: "my-old-site",
              type: "project"
            },
            response: {
              success: true,
              message: "Project my-old-site deleted successfully",
              deletedProject: "my-old-site",
              deletedDeployment: null
            }
          },
          deleteDeployment: {
            request: {
              projectName: "my-site",
              deploymentId: "abc123",
              type: "deployment"
            },
            response: {
              success: true,
              message: "Deployment abc123 deleted successfully",
              deletedProject: null,
              deletedDeployment: "abc123"
            }
          }
        }
      },
      "/api/delete (GET)": {
        method: "GET",
        description: "Get project information before deletion",
        queryParams: {
          project: "string - Project name to check"
        },
        response: {
          success: "boolean - Request success status",
          project: {
            id: "string - Project ID",
            name: "string - Project name",
            domain: "string - Project domain",
            createdAt: "string - ISO timestamp",
            deploymentsCount: "number - Number of deployments",
            deployments: "array - List of all deployments"
          },
          canDelete: "boolean - Whether project can be deleted"
        }
      },
      "/api/generate-stream": {
        method: "POST",
        description: "Generate HTML, CSS, and JavaScript content using OpenAI with real-time streaming",
        requestBody: {
          prompt: "string - Description of the page to generate",
          useStream: "boolean - Whether to use streaming (default: true)"
        },
        response: "Server-Sent Events (text/event-stream)",
        events: {
          status: {
            type: "string - 'status'",
            message: "string - Status message",
            progress: "number - Progress percentage (0-100)"
          },
          progress: {
            type: "string - 'progress'",
            content: "string - New content chunk",
            accumulated: "string - All accumulated content so far",
            progress: "number - Progress percentage (0-100)"
          },
          complete: {
            type: "string - 'complete'",
            html: "string - Generated HTML content",
            css: "string - Generated CSS content",
            js: "string - Generated JavaScript content",
            canDeploy: "boolean - Whether deployment is available",
            deployEndpoint: "string - Endpoint for deployment",
            progress: "number - 100"
          },
          error: {
            type: "string - 'error'",
            error: "string - Error message",
            raw: "string - Raw response (if applicable)"
          }
        },
        example: {
          request: {
            prompt: "Create a modern landing page for a tech startup",
            useStream: true
          },
          streamEvents: [
            "data: {\"type\":\"status\",\"message\":\"Starting code generation...\",\"progress\":0}",
            "data: {\"type\":\"progress\",\"content\":\"{\",\"accumulated\":\"{\",\"progress\":5}",
            "data: {\"type\":\"progress\",\"content\":\"\\\"html\\\":\",\"accumulated\":\"{\\\"html\\\":\",\"progress\":10}",
            "data: {\"type\":\"complete\",\"html\":\"<div>...</div>\",\"css\":\".class{...}\",\"js\":\"console.log();\",\"progress\":100}",
            "data: [DONE]"
          ]
        }
      },
      "/api/deploy-stream": {
        method: "POST",
        description: "Deploy content to CloudFlare Pages with real-time streaming progress",
        requestBody: {
          html: "string - HTML content to deploy (required)",
          css: "string - CSS content to deploy (optional)",
          js: "string - JavaScript content to deploy (optional)",
          projectName: "string - Custom project name (optional, auto-generated if not provided)"
        },
        response: "Server-Sent Events (text/event-stream)",
        events: {
          status: {
            type: "string - 'status'",
            message: "string - Status message",
            progress: "number - Progress percentage (0-100)",
            projectName: "string - Project name (if available)"
          },
          complete: {
            type: "string - 'complete'",
            success: "boolean - Deployment success status",
            deployment: {
              id: "string - Deployment ID",
              url: "string - Live URL of deployed page",
              projectName: "string - Project name used",
              createdAt: "string - ISO timestamp of creation"
            },
            message: "string - Success message",
            progress: "number - 100"
          },
          error: {
            type: "string - 'error'",
            success: "boolean - false",
            error: "string - Error message"
          }
        },
        example: {
          request: {
            html: "<div class='container'>Hello World</div>",
            css: ".container { padding: 20px; }",
            js: "console.log('Page loaded');",
            projectName: "my-awesome-site"
          },
          streamEvents: [
            "data: {\"type\":\"status\",\"message\":\"Preparing deployment...\",\"progress\":10,\"projectName\":\"my-awesome-site\"}",
            "data: {\"type\":\"status\",\"message\":\"Uploading files to CloudFlare Pages...\",\"progress\":70}",
            "data: {\"type\":\"complete\",\"success\":true,\"deployment\":{\"url\":\"https://my-awesome-site.pages.dev\"},\"progress\":100}",
            "data: [DONE]"
          ]
        }
      },
      "/api/download": {
        method: "GET or POST",
        description: "Download and verify deployment files from CloudFlare Pages",
        requestMethods: {
          GET: {
            description: "Download specific file or get file list",
            queryParams: {
              projectName: "string - Project name (default: 'webmint-app')",
              deploymentId: "string - Deployment ID (optional, uses latest if not provided)",
              fileName: "string - Specific file to download (optional)"
            },
            response: {
              withFileName: "Raw file content with appropriate headers for download",
              withoutFileName: {
                success: "boolean - Operation success status",
                deploymentId: "string - Deployment ID used",
                deploymentUrl: "string - Base URL of deployment",
                files: "object - Map of filename to file metadata",
                fileCount: "number - Number of files found"
              }
            }
          },
          POST: {
            description: "Download files with action control",
            requestBody: {
              action: "string - 'download' or 'list' (required)",
              projectName: "string - Project name (default: 'webmint-app')",
              deploymentId: "string - Deployment ID (optional)",
              fileName: "string - Specific file name for download action (optional)"
            },
            response: {
              download: {
                success: "boolean - Download success status",
                file: {
                  name: "string - File name",
                  content: "string - File content",
                  size: "number - File size in bytes",
                  type: "string - MIME type"
                }
              },
              list: {
                success: "boolean - List success status",
                deploymentId: "string - Deployment ID",
                deploymentUrl: "string - Deployment URL",
                files: "array - Array of file metadata objects",
                fileCount: "number - Total file count"
              }
            }
          }
        },
        example: {
          downloadSpecificFile: {
            url: "/api/download?projectName=webmint-app&fileName=index.html",
            response: "Raw HTML content with download headers"
          },
          getFileList: {
            request: {
              action: "list",
              projectName: "webmint-app"
            },
            response: {
              success: true,
              deploymentId: "abc123",
              deploymentUrl: "https://abc123.webmint-app.pages.dev",
              files: [
                { name: "index.html", size: 1024, type: "text/html" },
                { name: "styles.css", size: 512, type: "text/css" },
                { name: "script.js", size: 256, type: "application/javascript" }
              ],
              fileCount: 3
            }
          },
          downloadWithContent: {
            request: {
              action: "download",
              projectName: "webmint-app",
              fileName: "index.html"
            },
            response: {
              success: true,
              file: {
                name: "index.html",
                content: "<!DOCTYPE html><html>...</html>",
                size: 1024,
                type: "text/html"
              }
            }
          }
        }
      }
    },
    authentication: {
      description: "CloudFlare API credentials are required for deployment operations",
      requiredEnvironmentVariables: {
        CLOUDFLARE_API_TOKEN: "CloudFlare API token with Pages permissions",
        CLOUDFLARE_ACCOUNT_ID: "CloudFlare account ID",
        OPENAI_API_KEY: "OpenAI API key for content generation"
      },
      setup: [
        "1. Go to https://dash.cloudflare.com/profile/api-tokens",
        "2. Create a custom token with permissions:",
        "   - Zone:Zone:Read",
        "   - Zone:Page Rules:Edit",
        "   - Account:Cloudflare Pages:Edit",
        "3. Get your Account ID from any zone dashboard",
        "4. Set environment variables in your deployment"
      ]
    },
    errorCodes: {
      400: "Bad Request - Missing or invalid parameters",
      404: "Not Found - Project or resource not found",
      405: "Method Not Allowed - Invalid HTTP method",
      500: "Internal Server Error - Server or API error",
      502: "Bad Gateway - Invalid response from external API"
    }
  };

  return json(apiDocumentation, {
    headers: {
      "Content-Type": "application/json"
    }
  });
}
