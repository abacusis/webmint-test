/**
 * Client utility for handling Server-Sent Events (SSE) streaming
 * Provides easy-to-use functions for streaming AI generation and deployment
 */

/**
 * Stream AI code generation with real-time updates
 * @param {string} prompt - The prompt for code generation
 * @param {Object} callbacks - Event callbacks
 * @param {Function} callbacks.onStatus - Called with status updates
 * @param {Function} callbacks.onProgress - Called with generation progress
 * @param {Function} callbacks.onComplete - Called when generation is complete
 * @param {Function} callbacks.onError - Called when an error occurs
 * @returns {Function} Abort function to stop the stream
 */
export function streamGeneration(prompt, callbacks = {}) {
  const {
    onStatus = () => {},
    onProgress = () => {},
    onComplete = () => {},
    onError = () => {}
  } = callbacks;

  let eventSource = null;
  let isAborted = false;

  // Start the streaming request
  fetch('/api/generate-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, useStream: true })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    function readStream() {
      return reader.read().then(({ done, value }) => {
        if (done || isAborted) {
          return;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              return;
            }

            try {
              const event = JSON.parse(data);
              
              switch (event.type) {
                case 'status':
                  onStatus(event.message, event.progress || 0);
                  break;
                  
                case 'progress':
                  onProgress(event.content, event.accumulated, event.progress || 0);
                  break;
                  
                case 'complete':
                  onComplete({
                    html: event.html,
                    css: event.css,
                    js: event.js,
                    canDeploy: event.canDeploy,
                    deployEndpoint: event.deployEndpoint
                  });
                  return;
                  
                case 'error':
                  onError(new Error(event.error), event.raw);
                  return;
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', data);
            }
          }
        }

        return readStream();
      });
    }

    return readStream();
  })
  .catch(error => {
    if (!isAborted) {
      onError(error);
    }
  });

  // Return abort function
  return () => {
    isAborted = true;
    if (eventSource) {
      eventSource.close();
    }
  };
}

/**
 * Stream deployment process with real-time updates
 * @param {Object} files - Files to deploy
 * @param {string} files.html - HTML content
 * @param {string} files.css - CSS content
 * @param {string} files.js - JavaScript content
 * @param {string} files.projectName - Optional project name
 * @param {Object} callbacks - Event callbacks
 * @param {Function} callbacks.onStatus - Called with status updates
 * @param {Function} callbacks.onComplete - Called when deployment is complete
 * @param {Function} callbacks.onError - Called when an error occurs
 * @returns {Function} Abort function to stop the stream
 */
export function streamDeployment(files, callbacks = {}) {
  const {
    onStatus = () => {},
    onComplete = () => {},
    onError = () => {}
  } = callbacks;

  let isAborted = false;

  // Start the streaming request
  fetch('/api/deploy-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(files)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    function readStream() {
      return reader.read().then(({ done, value }) => {
        if (done || isAborted) {
          return;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              return;
            }

            try {
              const event = JSON.parse(data);
              
              switch (event.type) {
                case 'status':
                  onStatus(event.message, event.progress || 0, event.projectName);
                  break;
                  
                case 'complete':
                  onComplete({
                    success: event.success,
                    deployment: event.deployment,
                    message: event.message
                  });
                  return;
                  
                case 'error':
                  onError(new Error(event.error));
                  return;
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', data);
            }
          }
        }

        return readStream();
      });
    }

    return readStream();
  })
  .catch(error => {
    if (!isAborted) {
      onError(error);
    }
  });

  // Return abort function
  return () => {
    isAborted = true;
  };
}

/**
 * Example usage component for React/Vanilla JS
 */
export const StreamingExample = {
  /**
   * Generate code with streaming
   */
  generateWithStreaming: (prompt) => {
    console.log('🚀 Starting streaming generation...');
    
    const abort = streamGeneration(prompt, {
      onStatus: (message, progress) => {
        console.log(`📝 Status: ${message} (${progress}%)`);
        // Update your UI status here
      },
      
      onProgress: (content, accumulated, progress) => {
        console.log(`⚡ Progress: ${progress}% - New content: ${content.length} chars`);
        // Update your UI with real-time content here
        // You can show the accumulated content as it builds
      },
      
      onComplete: (result) => {
        console.log('✅ Generation complete!');
        console.log('HTML:', result.html.length, 'chars');
        console.log('CSS:', result.css.length, 'chars');
        console.log('JS:', result.js.length, 'chars');
        // Handle the completed result
      },
      
      onError: (error, raw) => {
        console.error('❌ Generation failed:', error.message);
        if (raw) {
          console.log('Raw response:', raw);
        }
        // Handle error in your UI
      }
    });

    // You can call abort() to stop the stream early
    // setTimeout(() => abort(), 5000); // Stop after 5 seconds
  },

  /**
   * Deploy with streaming
   */
  deployWithStreaming: (html, css, js, projectName) => {
    console.log('🚀 Starting streaming deployment...');
    
    const abort = streamDeployment({
      html,
      css,
      js,
      projectName
    }, {
      onStatus: (message, progress, projectName) => {
        console.log(`🔄 Deploy: ${message} (${progress}%)`);
        if (projectName) {
          console.log(`📦 Project: ${projectName}`);
        }
        // Update your deployment UI here
      },
      
      onComplete: (result) => {
        console.log('✅ Deployment complete!');
        console.log('URL:', result.deployment.url);
        console.log('Project:', result.deployment.projectName);
        // Handle successful deployment
      },
      
      onError: (error) => {
        console.error('❌ Deployment failed:', error.message);
        // Handle deployment error
      }
    });

    // You can call abort() to stop the deployment early
    return abort;
  }
};
