'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { streamGeneration, streamDeployment } from '@/lib/stream-client';
import { useWebMintHistory } from '@/hooks/useWebMintHistory';
import type { DeploymentData } from '@/lib/local-storage';

export default function Home() {
  // Main state
  const [prompt, setPrompt] = useState('');
  const [projectAlias, setProjectAlias] = useState(''); // New state for project alias
  const [generatedContent, setGeneratedContent] = useState({ html: '', css: '', js: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [deploymentStatus, setDeploymentStatus] = useState('');
  const [deploymentResult, setDeploymentResult] = useState<DeploymentData | null>(null);
  const [activeTab, setActiveTab] = useState('generator');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [deploymentProgress, setDeploymentProgress] = useState(0);
  
  // History state
  const {
    chats,
    stats,
    saveChat,
    saveDeployment,
    searchChats,
    getRecentActivity,
    getChatWithDeployments,
    refresh: refreshHistory
  } = useWebMintHistory();

  const [recentActivity, setRecentActivity] = useState<Array<Record<string, unknown>>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  // Refs for abort functions
  const abortGenerationRef = useRef<(() => void) | null>(null);
  const abortDeploymentRef = useRef<(() => void) | null>(null);

  const loadRecentActivity = useCallback(async () => {
    try {
      const activity = await getRecentActivity(10);
      setRecentActivity(activity);
    } catch (error) {
      console.error('Failed to load recent activity:', error);
    }
  }, [getRecentActivity]);

  // Load activity
  useEffect(() => {
    loadRecentActivity();
  }, [loadRecentActivity]);





  const handleGenerate = async () => {
    if (!prompt.trim() || !projectAlias.trim()) return;

    setIsGenerating(true);
    setGenerationStatus('Starting generation...');
    setGenerationProgress(0);
    setGeneratedContent({ html: '', css: '', js: '' });

    const abort = streamGeneration(prompt, {
      onStatus: (message, progress = 0) => {
        setGenerationStatus(message);
        setGenerationProgress(progress);
      },
      onProgress: (content, accumulated, progress = 0) => {
        setGenerationProgress(progress);
        // You could show accumulated content here if desired
      },
      onComplete: async (result) => {
        setGeneratedContent({
          html: result.html,
          css: result.css,
          js: result.js
        });
        setGenerationStatus('Generation completed!');
        setGenerationProgress(100);
        setIsGenerating(false);

        // Save to history
        try {
          await saveChat({
            prompt,
            generatedContent: {
              html: result.html,
              css: result.css,
              js: result.js
            },
            projectAlias: projectAlias.trim() || undefined, // Save project alias
            status: 'completed'
          });
          await loadRecentActivity();
        } catch (error) {
          console.error('Failed to save chat:', error);
        }
      },
      onError: (error) => {
        setGenerationStatus(`Error: ${error.message}`);
        setIsGenerating(false);
        setGenerationProgress(0);
      }
    });

    abortGenerationRef.current = abort;
  };

  const handleDeploy = async () => {
    if (!generatedContent.html || !projectAlias.trim()) return;

    // Debug: Log content being deployed
    console.log('=== HANDLE DEPLOY DEBUG ===');
    console.log('HTML length:', generatedContent.html?.length || 0);
    console.log('CSS length:', generatedContent.css?.length || 0);
    console.log('JS length:', generatedContent.js?.length || 0);
    console.log('HTML preview:', generatedContent.html?.substring(0, 100) || 'EMPTY');

    setIsDeploying(true);
    setDeploymentStatus('Starting deployment...');
    setDeploymentProgress(0);
    setDeploymentResult(null);

    const abort = streamDeployment({
      html: generatedContent.html,
      css: generatedContent.css,
      js: generatedContent.js,
      projectAlias: projectAlias.trim() || undefined // Pass project alias to deployment
    }, {
      onStatus: (message, progress = 0) => {
        setDeploymentStatus(message);
        setDeploymentProgress(progress);
      },
      onComplete: async (result) => {
        setDeploymentResult(result.deployment);
        setDeploymentStatus('Deployment completed!');
        setDeploymentProgress(100);
        setIsDeploying(false);

        // Save deployment to history
        try {
          const currentChat = chats.find(chat => 
            chat.prompt === prompt && 
            chat.generatedContent.html === generatedContent.html
          );
          
          if (currentChat) {
            await saveDeployment({
              chatId: currentChat.id,
              projectName: result.deployment.projectName,
              url: result.deployment.url,
              deploymentId: result.deployment.deploymentId,
              status: 'active',
              createdAt: result.deployment.createdAt
            });
            await loadRecentActivity();

          }
        } catch (error) {
          console.error('Failed to save deployment:', error);
        }
      },
      onError: (error) => {
        setDeploymentStatus(`Error: ${error.message}`);
        setIsDeploying(false);
        setDeploymentProgress(0);
      }
    });

    abortDeploymentRef.current = abort;
  };

  const handleAbort = () => {
    if (abortGenerationRef.current) {
      abortGenerationRef.current();
      abortGenerationRef.current = null;
    }
    if (abortDeploymentRef.current) {
      abortDeploymentRef.current();
      abortDeploymentRef.current = null;
    }
    setIsGenerating(false);
    setIsDeploying(false);
    setGenerationProgress(0);
    setDeploymentProgress(0);
  };

  const handleNewChat = () => {
    setPrompt('');
    setProjectAlias('');
    setGeneratedContent({ html: '', css: '', js: '' });
    setDeploymentResult(null);
    setGenerationStatus('');
    setDeploymentStatus('');
    setGenerationProgress(0);
    setDeploymentProgress(0);
    setActiveTab('generator');
  };

  const handleSelectHistoryChat = async (chat: { id: number; prompt: string; generatedContent: { html: string; css: string; js: string }; projectAlias?: string }) => {
    setPrompt(chat.prompt);
    setProjectAlias(chat.projectAlias || ''); // Load the project alias
    setGeneratedContent(chat.generatedContent);
    setActiveTab('generator');
    
    // Load associated deployments
    try {
      const chatWithDeployments = await getChatWithDeployments(chat.id);
      if (chatWithDeployments?.deployments && chatWithDeployments.deployments.length > 0) {
        setDeploymentResult(chatWithDeployments.deployments[0]);
      }
    } catch (error) {
      console.error('Failed to load chat deployments:', error);
    }
  };

  const handleSearchChats = async () => {
    if (searchTerm.trim()) {
      await searchChats(searchTerm);
    } else {
      await refreshHistory();
    }
  };

  const handleDownloadFiles = async () => {
    if (!deploymentResult) return;

    setIsDownloading(true);
    try {
      const response = await fetch(`/api/download?project=${deploymentResult.projectName}&deployment=${deploymentResult.deploymentId}`);
      const result = await response.json();
      
      if (result.success) {
        console.log('Downloaded files:', result.files);
      } else {
        console.error('Download failed:', result.error);
      }
    } catch (error) {
      console.error('Download error:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="flex justify-between items-center mb-4">
            <div className="flex-1"></div>
            <div className="flex-1 text-center">
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                WebMint AI
              </h1>
            </div>
            <div className="flex-1 flex justify-end">
              <button
                onClick={handleNewChat}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                + New Chat
              </button>
            </div>
          </div>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Generate and deploy beautiful web pages with AI
          </p>
        </header>

        {/* Stats */}
        <div className="flex justify-center gap-4 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-2 shadow">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total Chats: </span>
            <span className="font-bold text-blue-600 dark:text-blue-400">{stats.totalChats}</span>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-2 shadow">
            <span className="text-sm text-gray-600 dark:text-gray-400">Deployments: </span>
            <span className="font-bold text-green-600 dark:text-green-400">{stats.totalDeployments}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-1 shadow">
            <button
              onClick={() => setActiveTab('generator')}
              className={`px-6 py-2 rounded-md transition-colors ${
                activeTab === 'generator'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Generator
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-2 rounded-md transition-colors ${
                activeTab === 'history'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              History
            </button>
          </div>
        </div>

        {/* Generator Tab */}
        {activeTab === 'generator' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column - Generator */}
            <div className="space-y-6">
              {/* Prompt Input */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
                <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                  Generate Your Website
                </h2>
                
                {/* Project Alias Input */}
                <div className="mb-4">
                  <label htmlFor="projectAlias" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Project Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="projectAlias"
                    type="text"
                    value={projectAlias}
                    onChange={(e) => setProjectAlias(e.target.value)}
                    placeholder="my-awesome-website"
                    className={`w-full p-3 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                      !projectAlias.trim() 
                        ? 'border-red-300 dark:border-red-600 focus:border-red-500 focus:ring-red-500' 
                        : 'border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                    disabled={isGenerating}
                    required
                  />
                  {!projectAlias.trim() && (
                    <p className="text-xs text-red-500 mt-1">
                      Project name is required to avoid creating too many projects.
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Reuse the same project name to update existing deployments.
                  </p>
                </div>
                
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the website you want to create..."
                  className="w-full h-32 p-4 border border-gray-300 dark:border-gray-600 rounded-lg resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  disabled={isGenerating}
                />
                
                {/* Generation Status */}
                {isGenerating && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                      <span>{generationStatus}</span>
                      <span>{generationProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${generationProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 mt-4">
                  {!isGenerating ? (
                    <button
                      onClick={handleGenerate}
                      disabled={!prompt.trim() || !projectAlias.trim()}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                    >
                      Generate Website
                    </button>
                  ) : (
                    <button
                      onClick={handleAbort}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                    >
                      Stop Generation
                    </button>
                  )}
                  
                  {generatedContent.html && !isGenerating && (
                    <button
                      onClick={handleDeploy}
                      disabled={isDeploying}
                      className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                    >
                      {isDeploying ? 'Deploying...' : 'Deploy to CloudFlare'}
                    </button>
                  )}
                </div>
              </div>

              {/* Deployment Status */}
              {isDeploying && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
                  <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                    Deployment Progress
                  </h3>
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span>{deploymentStatus}</span>
                    <span>{deploymentProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${deploymentProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Deployment Result */}
              {deploymentResult && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
                  <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                    Deployment Successful! 🎉
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">URL: </span>
                      <a 
                        href={deploymentResult.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-600 underline"
                      >
                        {deploymentResult.url}
                      </a>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">Project: </span>
                      <span className="font-medium text-gray-900 dark:text-white">{deploymentResult.projectName}</span>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <a
                        href={deploymentResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        Visit Site
                      </a>
                      <button
                        onClick={handleDownloadFiles}
                        disabled={isDownloading}
                        className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        {isDownloading ? 'Downloading...' : 'Download Files'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Preview */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                Live Preview
              </h2>
              {generatedContent.html ? (
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                  <iframe
                    srcDoc={`
                      <!DOCTYPE html>
                      <html lang="en">
                      <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Preview</title>
                        <script src="https://cdn.tailwindcss.com"></script>
                        <style>${generatedContent.css}</style>
                      </head>
                      <body>
                        ${generatedContent.html}
                        <script>${generatedContent.js}</script>
                      </body>
                      </html>
                    `}
                    className="w-full h-96 border-0"
                    title="Generated Website Preview"
                  />
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg h-96 flex items-center justify-center">
                  <p className="text-gray-500 dark:text-gray-400">
                    Generate a website to see the preview here
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            {/* Search */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search chats..."
                  className="flex-1 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearchChats()}
                />
                <button
                  onClick={handleSearchChats}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg transition-colors"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                Recent Activity
              </h3>
              <div className="space-y-3">
                {recentActivity.slice(0, 5).map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {item.type === 'chat' ? (item.prompt as string)?.substring(0, 50) + '...' : `Deployment: ${item.projectName}`}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(item.timestamp as string).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${
                      item.type === 'chat' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {item.type as string}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat History */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                Chat History
              </h3>
              <div className="space-y-3">
                {chats.slice(0, 10).map((chat) => (
                  <div key={chat.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white mb-2">
                          {chat.prompt}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {new Date(chat.timestamp || 0).toLocaleDateString()} • 
                                                    HTML: {(chat.metadata?.htmlLength as number) || 0} chars •
                          CSS: {(chat.metadata?.cssLength as number) || 0} chars •
                          JS: {(chat.metadata?.jsLength as number) || 0} chars
                        </p>
                      </div>
                      <button
                        onClick={() => handleSelectHistoryChat(chat)}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition-colors"
                      >
                        Load
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
