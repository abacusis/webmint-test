import { useState, useRef } from 'react';
import { streamGeneration, streamDeployment } from '../utils/stream-client';
import { useWebMintHistory } from '../hooks/useWebMintHistory';

export function StreamingGenerator() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [generatedContent, setGeneratedContent] = useState({
    html: '',
    css: '',
    js: ''
  });
  const [deploymentResult, setDeploymentResult] = useState(null);
  const [accumulatedText, setAccumulatedText] = useState('');
  const [currentChatId, setCurrentChatId] = useState(null);
  
  const abortControllerRef = useRef(null);
  const { saveChat, saveDeployment, stats } = useWebMintHistory();

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    setIsGenerating(true);
    setStatus('Initializing...');
    setProgress(0);
    setAccumulatedText('');
    setGeneratedContent({ html: '', css: '', js: '' });
    
    const abort = streamGeneration(prompt, {
      onStatus: (message, progressValue) => {
        setStatus(message);
        setProgress(progressValue);
      },
      
      onProgress: (content, accumulated, progressValue) => {
        setAccumulatedText(accumulated);
        setProgress(progressValue);
        setStatus('Generating code...');
      },
      
      onComplete: async (result) => {
        setGeneratedContent(result);
        setStatus('Generation completed! Saving to history...');
        setProgress(100);
        setIsGenerating(false);
        setAccumulatedText('');
        
        // Save chat to IndexedDB
        try {
          const chatId = await saveChat(prompt, result, 'completed');
          setCurrentChatId(chatId);
          setStatus('Generation completed and saved!');
        } catch (error) {
          console.error('Failed to save chat:', error);
          setStatus('Generation completed (save failed)');
        }
      },
      
      onError: (error) => {
        setStatus(`Error: ${error.message}`);
        setProgress(0);
        setIsGenerating(false);
        setAccumulatedText('');
        console.error('Generation error:', error);
      }
    });
    
    abortControllerRef.current = abort;
  };

  const handleDeploy = async () => {
    if (!generatedContent.html) return;
    
    setIsDeploying(true);
    setStatus('Preparing deployment...');
    setProgress(0);
    setDeploymentResult(null);
    
    const abort = streamDeployment({
      html: generatedContent.html,
      css: generatedContent.css,
      js: generatedContent.js,
      projectName: `webmint-${Date.now()}`
    }, {
      onStatus: (message, progressValue, projectName) => {
        setStatus(message);
        setProgress(progressValue);
      },
      
      onComplete: async (result) => {
        setDeploymentResult(result);
        setStatus('Deployment completed! Saving to history...');
        setProgress(100);
        setIsDeploying(false);
        
        // Save deployment to IndexedDB
        try {
          if (currentChatId && result.deployment) {
            await saveDeployment(currentChatId, result.deployment);
            setStatus('Deployment completed and saved!');
          } else {
            setStatus('Deployment completed!');
          }
        } catch (error) {
          console.error('Failed to save deployment:', error);
          setStatus('Deployment completed (save failed)');
        }
      },
      
      onError: (error) => {
        setStatus(`Deployment error: ${error.message}`);
        setProgress(0);
        setIsDeploying(false);
        console.error('Deployment error:', error);
      }
    });
    
    abortControllerRef.current = abort;
  };

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setIsDeploying(false);
    setStatus('Aborted');
    setProgress(0);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold mb-4">Streaming Code Generator</h1>
        
        {/* Prompt Input */}
        <div className="mb-4">
          <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
            Describe the website you want to create:
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Create a modern portfolio website for a web developer..."
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={4}
            disabled={isGenerating || isDeploying}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mb-4">
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating || isDeploying}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isGenerating && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            )}
            {isGenerating ? 'Generating...' : 'Generate Code'}
          </button>
          
          <button
            onClick={handleDeploy}
            disabled={!generatedContent.html || isGenerating || isDeploying}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isDeploying && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            )}
            {isDeploying ? 'Deploying...' : 'Deploy to CloudFlare'}
          </button>
          
          {(isGenerating || isDeploying) && (
            <button
              onClick={handleAbort}
              className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Abort
            </button>
          )}
        </div>

        {/* Status and Progress */}
        {(isGenerating || isDeploying || status) && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">{status}</span>
              <span className="text-sm text-gray-500">{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Real-time Content Preview */}
        {accumulatedText && (
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">Generating...</h3>
            <div className="bg-gray-50 p-4 rounded-md max-h-40 overflow-y-auto">
              <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                {accumulatedText}
              </pre>
            </div>
          </div>
        )}

        {/* Generated Content */}
        {generatedContent.html && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Generated Code</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h4 className="font-medium text-gray-700 mb-2">HTML ({generatedContent.html.length} chars)</h4>
                <textarea
                  value={generatedContent.html}
                  readOnly
                  className="w-full h-32 p-2 border border-gray-300 rounded text-xs font-mono"
                />
              </div>
              
              <div>
                <h4 className="font-medium text-gray-700 mb-2">CSS ({generatedContent.css.length} chars)</h4>
                <textarea
                  value={generatedContent.css}
                  readOnly
                  className="w-full h-32 p-2 border border-gray-300 rounded text-xs font-mono"
                />
              </div>
              
              <div>
                <h4 className="font-medium text-gray-700 mb-2">JavaScript ({generatedContent.js.length} chars)</h4>
                <textarea
                  value={generatedContent.js}
                  readOnly
                  className="w-full h-32 p-2 border border-gray-300 rounded text-xs font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* Deployment Result */}
        {deploymentResult && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <h3 className="text-lg font-semibold text-green-800 mb-2">Deployment Successful!</h3>
            <div className="space-y-2">
              <p><strong>Project:</strong> {deploymentResult.deployment.projectName}</p>
              <p><strong>URL:</strong> 
                <a 
                  href={deploymentResult.deployment.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 ml-2"
                >
                  {deploymentResult.deployment.url}
                </a>
              </p>
              <p><strong>Deployment ID:</strong> {deploymentResult.deployment.id}</p>
            </div>
          </div>
        )}
      </div>

      {/* Database Statistics */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-800 mb-2">Local History:</h3>
        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
          <div>
            <span className="font-medium">Saved Chats:</span> {stats.totalChats || 0}
          </div>
          <div>
            <span className="font-medium">Deployments:</span> {stats.totalDeployments || 0}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          All your chats and deployments are automatically saved locally in your browser.
        </p>
      </div>

      {/* Usage Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">How to Use Streaming:</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Enter a description of the website you want to create</li>
          <li>• Click "Generate Code" to start streaming AI generation</li>
          <li>• Watch the real-time progress and content generation</li>
          <li>• Once complete, click "Deploy to CloudFlare" to publish your site</li>
          <li>• You can abort any operation at any time</li>
          <li>• All chats and deployments are automatically saved to your local history</li>
        </ul>
      </div>
    </div>
  );
}
