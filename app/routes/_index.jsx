import { useEffect, useMemo, useRef, useState } from "react";
import { streamGeneration, streamDeployment } from "../utils/stream-client";
import { useWebMintHistory } from "../hooks/useWebMintHistory";

export default function Index() {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState({ html: "", css: "", js: "" });
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [accumulatedText, setAccumulatedText] = useState("");
  const [currentChatId, setCurrentChatId] = useState(null);
  const [deploymentResult, setDeploymentResult] = useState(null);
  const [activeTab, setActiveTab] = useState("generator");
  const [selectedHistoryChat, setSelectedHistoryChat] = useState(null);
  const [downloadFiles, setDownloadFiles] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [chatsWithDeployments, setChatsWithDeployments] = useState([]);
  const [backupList, setBackupList] = useState([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);

  const iframeRef = useRef(null);
  const abortControllerRef = useRef(null);
  const { chats, deployments, saveChat, saveDeployment, stats, getRecentActivity, getChatWithDeployments } = useWebMintHistory();
  const [recentActivity, setRecentActivity] = useState([]);

  const examplePrompt = useMemo(() => "Generate a horizontal navbar with search and actions using Tailwind.", []);

  function buildPreview({ html, css, js }) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><script src="https://cdn.tailwindcss.com"></script><style>${css || ""}</style></head><body class="min-h-screen">${html || ""}<script>try{(function(){${js || ""}})()}catch(e){console.error(e)}<\/script></body></html>`;
  }

  useEffect(() => {
    const doc = buildPreview(code);
    const docEl = iframeRef.current?.contentWindow?.document;
    if (!docEl) return;
    docEl.open();
    docEl.write(doc);
    docEl.close();
  }, [code]);

  // Load recent activity on mount
  useEffect(() => {
    loadRecentActivity();
  }, []);

  // Load chats with deployments when switching to history tab
  useEffect(() => {
    if (activeTab === 'history') {
      if (chats.length > 0) {
        loadChatsWithDeployments();
      }
      loadBackupList();
    }
  }, [activeTab, chats]);

  const loadRecentActivity = async () => {
    try {
      const activity = await getRecentActivity();
      setRecentActivity(activity);
    } catch (error) {
      console.error('Failed to load recent activity:', error);
    }
  };

  const loadChatsWithDeployments = async () => {
    try {
      const chatsWithDeps = await Promise.all(
        chats.slice(0, 10).map(async (chat) => {
          try {
            return await getChatWithDeployments(chat.id);
          } catch (error) {
            console.error(`Failed to load deployments for chat ${chat.id}:`, error);
            return { ...chat, deployments: [] };
          }
        })
      );
      setChatsWithDeployments(chatsWithDeps);
    } catch (error) {
      console.error('Failed to load chats with deployments:', error);
    }
  };

  async function handleGenerate() {
    if (!prompt.trim() && !examplePrompt) return;
    
    setIsLoading(true);
    setError("");
    setStatus("Initializing...");
    setProgress(0);
    setAccumulatedText("");
    setCode({ html: "", css: "", js: "" });
    setDeploymentResult(null);
    
    const abort = streamGeneration(prompt.trim() || examplePrompt, {
      onStatus: (message, progressValue) => {
        setStatus(message);
        setProgress(progressValue);
      },
      
      onProgress: (content, accumulated, progressValue) => {
        setAccumulatedText(accumulated);
        setProgress(progressValue);
        setStatus("Generating code...");
      },
      
      onComplete: async (result) => {
        setCode(result);
        setStatus("Generation completed! Saving to history...");
        setProgress(100);
        setIsLoading(false);
        setAccumulatedText("");
        
        // Save chat to IndexedDB
        try {
          const chatId = await saveChat(prompt.trim() || examplePrompt, result, 'completed');
          setCurrentChatId(chatId);
          setStatus("Generation completed and saved!");
          await loadRecentActivity();
        } catch (error) {
          console.error('Failed to save chat:', error);
          setStatus('Generation completed (save failed)');
        }
      },
      
      onError: (error) => {
        setStatus(`Error: ${error.message}`);
        setProgress(0);
        setIsLoading(false);
        setAccumulatedText("");
        setError(error.message);
      }
    });
    
    abortControllerRef.current = abort;
  }

  const handleDeploy = async () => {
    if (!code.html) return;
    
    setIsDeploying(true);
    setStatus("Preparing deployment...");
    setProgress(0);
    setDeploymentResult(null);
    
    const abort = streamDeployment({
      html: code.html,
      css: code.css,
      js: code.js
      // No projectName - will use default 'webmint-app'
    }, {
      onStatus: (message, progressValue) => {
        setStatus(message);
        setProgress(progressValue);
      },
      
      onComplete: async (result) => {
        setDeploymentResult(result);
        setStatus("Deployment completed! Saving to history...");
        setProgress(100);
        setIsDeploying(false);
        
        // Save deployment to IndexedDB
        try {
          if (currentChatId && result.deployment) {
            await saveDeployment(currentChatId, result.deployment);
            setStatus("Deployment completed and saved!");
            await loadRecentActivity();
            // Reload chats with deployments if we're on history tab
            if (activeTab === 'history') {
              await loadChatsWithDeployments();
            }
          } else {
            setStatus("Deployment completed!");
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
      }
    });
    
    abortControllerRef.current = abort;
  };

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setIsDeploying(false);
    setStatus("Aborted");
    setProgress(0);
  };

  const handleSelectHistoryChat = async (chat) => {
    setSelectedHistoryChat(chat);
    setPrompt(chat.prompt);
    setCode(chat.generatedContent);
    setCurrentChatId(chat.id);
    
    // Load chat with deployments to get associated deployment info
    try {
      const chatWithDeployments = await getChatWithDeployments(chat.id);
      if (chatWithDeployments.deployments && chatWithDeployments.deployments.length > 0) {
        // Set the most recent deployment as the current deployment result
        const latestDeployment = chatWithDeployments.deployments[0];
        setDeploymentResult({
          deployment: {
            deploymentId: latestDeployment.deploymentId,
            url: latestDeployment.url,
            projectName: latestDeployment.projectName,
            createdAt: latestDeployment.timestamp
          }
        });
      } else {
        setDeploymentResult(null);
      }
    } catch (error) {
      console.error('Failed to load chat deployments:', error);
      setDeploymentResult(null);
    }
    
    setActiveTab("generator");
  };

  const handleDownloadFiles = async () => {
    if (!deploymentResult?.deployment?.deploymentId) {
      setError("No deployment available to download");
      return;
    }

    setIsDownloading(true);
    setError("");

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'download',
          projectName: deploymentResult.deployment.projectName,
          deploymentId: deploymentResult.deployment.deploymentId
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to download files');
      }

      if (result.success) {
        setDownloadFiles(result.files);
        setStatus(`Downloaded ${result.fileCount} files`);
      } else {
        throw new Error(result.error || 'Download failed');
      }
    } catch (error) {
      console.error('Download error:', error);
      setError(`Download error: ${error.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadSingleFile = async (fileName) => {
    if (!deploymentResult?.deployment?.deploymentId) {
      setError("No deployment available to download");
      return;
    }

    try {
      const url = `/api/download?projectName=${deploymentResult.deployment.projectName}&deploymentId=${deploymentResult.deployment.deploymentId}&fileName=${fileName}`;
      
      // Create a temporary link to trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setStatus(`Downloaded ${fileName}`);
    } catch (error) {
      console.error('Download error:', error);
      setError(`Download error: ${error.message}`);
    }
  };

  const handleDownloadFromHistory = async (deployment, fileName = 'index.html') => {
    try {
      const url = `/api/download?projectName=${deployment.projectName}&deploymentId=${deployment.deploymentId}&fileName=${fileName}`;
      
      // Create a temporary link to trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setStatus(`Downloaded ${fileName} from ${deployment.projectName}`);
    } catch (error) {
      console.error('Download error:', error);
      setError(`Download error: ${error.message}`);
    }
  };

  const loadBackupList = async () => {
    setIsLoadingBackups(true);
    try {
      const response = await fetch('/api/backup?list=true');
      const result = await response.json();
      
      if (result.success) {
        setBackupList(result.backups);
      } else {
        setError(`Failed to load backups: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to load backup list:', error);
      setError(`Failed to load backups: ${error.message}`);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleDownloadBackupZip = async (backup, zipFile) => {
    try {
      const url = `/api/backup?folder=${backup.folder}&file=${zipFile}`;
      
      // Create a temporary link to trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = zipFile;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setStatus(`Downloaded backup ZIP: ${zipFile}`);
    } catch (error) {
      console.error('Backup download error:', error);
      setError(`Backup download error: ${error.message}`);
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800/70 bg-gray-900/40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-white">WebMint</h1>
              <span className="text-sm text-gray-400">AI Code Generation + CloudFlare Deployment</span>
            </div>
            
            <div className="flex space-x-1 bg-gray-800/50 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('generator')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'generator'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Generator
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'history'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                History ({stats.totalChats || 0})
              </button>
            </div>
          </div>
        </div>
      </header>

      {activeTab === 'generator' ? (
        <main className="max-w-[1400px] mx-auto px-4 py-6 flex gap-4">
          <section className="w-full max-w-xl shrink-0 flex flex-col gap-4">
            {/* Prompt Section */}
            <div className="bg-gray-900/40 border border-gray-800/70 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800/70 flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-300">Prompt</h2>
                <button
                  onClick={() => setPrompt(examplePrompt)}
                  className="text-xs text-indigo-300 hover:text-indigo-200"
                >
                  Use example
                </button>
              </div>
              <div className="p-4">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full h-[200px] p-3 rounded-lg bg-gray-950/60 border border-gray-800/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-y text-white placeholder-gray-400"
                  placeholder="Describe the UI you want. Include interactions and layout details."
                  disabled={isLoading || isDeploying}
                />
                
                {/* Action Buttons */}
                <div className="mt-3 flex items-center gap-2">
                  <button 
                    onClick={handleGenerate} 
                    disabled={(!prompt.trim() && !examplePrompt) || isLoading || isDeploying}
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {isLoading && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    )}
                    {isLoading ? "Generating..." : "Generate"}
                  </button>
                  
                  <button
                    onClick={handleDeploy}
                    disabled={!code.html || isLoading || isDeploying}
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {isDeploying && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    )}
                    {isDeploying ? "Deploying..." : "Deploy to CloudFlare"}
                  </button>
                  
                  {(isLoading || isDeploying) && (
                    <button
                      onClick={handleAbort}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                    >
                      Abort
                    </button>
                  )}
                </div>

                {/* Status and Progress */}
                {(isLoading || isDeploying || status) && (
                  <div className="mt-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-300">{status}</span>
                      <span className="text-sm text-gray-500">{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Real-time Content Preview */}
                {accumulatedText && (
                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Generating...</h3>
                    <div className="bg-gray-950/60 p-3 rounded-lg max-h-32 overflow-y-auto">
                      <pre className="text-xs text-gray-400 whitespace-pre-wrap">
                        {accumulatedText}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Deployment Result */}
                {deploymentResult && (
                  <div className="mt-4 p-3 bg-green-900/20 border border-green-700/50 rounded-lg">
                    <h3 className="text-sm font-medium text-green-400 mb-2">Deployment Successful!</h3>
                    <div className="space-y-1 text-xs">
                      <p><strong>Project:</strong> {deploymentResult.deployment.projectName}</p>
                      <p><strong>URL:</strong> 
                        <a 
                          href={deploymentResult.deployment.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-green-400 hover:text-green-300 ml-2"
                        >
                          {deploymentResult.deployment.url}
                        </a>
                      </p>
                    </div>
                    
                    {/* Download Actions */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={handleDownloadFiles}
                        disabled={isDownloading}
                        className="inline-flex items-center px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {isDownloading && (
                          <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin mr-1"></div>
                        )}
                        {isDownloading ? "Loading..." : "Verify Files"}
                      </button>
                      
                      <button
                        onClick={() => handleDownloadSingleFile('index.html')}
                        className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded-md"
                      >
                        Download HTML
                      </button>
                      
                      <button
                        onClick={() => handleDownloadSingleFile('styles.css')}
                        className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded-md"
                      >
                        Download CSS
                      </button>
                      
                      <button
                        onClick={() => handleDownloadSingleFile('script.js')}
                        className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded-md"
                      >
                        Download JS
                      </button>
                    </div>
                  </div>
                )}

                {/* Downloaded Files Verification */}
                {downloadFiles && (
                  <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                    <h3 className="text-sm font-medium text-blue-400 mb-2">File Verification</h3>
                    <div className="space-y-2 text-xs">
                      {Object.entries(downloadFiles).map(([fileName, file]) => (
                        <div key={fileName} className="bg-gray-950/60 p-2 rounded">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-medium text-white">{fileName}</span>
                            <span className="text-gray-400">{file.size} bytes</span>
                          </div>
                          <div className="text-gray-300 max-h-20 overflow-y-auto">
                            <pre className="whitespace-pre-wrap text-xs">
                              {file.content.substring(0, 200)}{file.content.length > 200 ? '...' : ''}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-4 p-3 bg-red-900/20 border border-red-700/50 rounded-lg">
                    <span className="text-sm text-red-400">{error}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Generated Code Section */}
            <div className="bg-gray-900/40 border border-gray-800/70 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800/70">
                <h2 className="text-sm font-medium text-gray-300">Generated code</h2>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">HTML ({code.html.length} chars)</label>
                  <textarea 
                    value={code.html} 
                    onChange={(e) => setCode((c) => ({ ...c, html: e.target.value }))} 
                    spellCheck={false} 
                    className="w-full h-32 p-3 rounded-lg bg-black/60 border border-gray-800/80 text-xs font-mono text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" 
                    placeholder="Generated HTML will appear here..."
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">CSS ({code.css.length} chars)</label>
                  <textarea 
                    value={code.css} 
                    onChange={(e) => setCode((c) => ({ ...c, css: e.target.value }))} 
                    spellCheck={false} 
                    className="w-full h-32 p-3 rounded-lg bg-black/60 border border-gray-800/80 text-xs font-mono text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" 
                    placeholder="Generated CSS will appear here..."
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">JavaScript ({code.js.length} chars)</label>
                  <textarea 
                    value={code.js} 
                    onChange={(e) => setCode((c) => ({ ...c, js: e.target.value }))} 
                    spellCheck={false} 
                    className="w-full h-32 p-3 rounded-lg bg-black/60 border border-gray-800/80 text-xs font-mono text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" 
                    placeholder="Generated JavaScript will appear here..."
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Preview Section */}
          <section className="flex-1 min-w-0">
            <div className="bg-gray-900/40 border border-gray-800/70 rounded-xl overflow-hidden h-full min-h-[680px] flex flex-col">
              <div className="px-4 py-3 border-b border-gray-800/70 flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-300">Live preview</h2>
                <div className="text-xs text-gray-500">Tailwind via CDN in sandbox</div>
              </div>
              <div className="flex-1">
                <iframe ref={iframeRef} title="Preview" className="w-full h-full bg-white" />
              </div>
            </div>
          </section>
        </main>
      ) : (
        /* History Section */
        <main className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-gray-900/40 border border-gray-800/70 rounded-xl overflow-hidden">
            {/* Stats */}
            <div className="p-6 border-b border-gray-800/70">
              <h2 className="text-lg font-semibold text-white mb-4">Your History</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-indigo-900/20 border border-indigo-700/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-indigo-400">{stats.totalChats || 0}</div>
                  <div className="text-sm text-indigo-300">Total Chats</div>
                </div>
                <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-400">{stats.totalDeployments || 0}</div>
                  <div className="text-sm text-green-300">Deployments</div>
                </div>
                <div className="bg-purple-900/20 border border-purple-700/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-purple-400">{recentActivity.length}</div>
                  <div className="text-sm text-purple-300">Recent Items</div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="p-6">
              <h3 className="text-md font-semibold text-white mb-4">Recent Activity</h3>
              {recentActivity.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p>No activity found.</p>
                  <p className="text-sm">Generate some content to see your history here!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.slice(0, 8).map((activity) => (
                    <div
                      key={`${activity.type}-${activity.id}`}
                      className="border border-gray-800/70 rounded-lg p-4 hover:bg-gray-800/20 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              activity.type === 'chat' 
                                ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/50' 
                                : 'bg-green-900/40 text-green-300 border border-green-700/50'
                            }`}>
                              {activity.type}
                            </span>
                            <span className="text-sm text-gray-500">
                              {formatTimestamp(activity.timestamp)}
                            </span>
                          </div>
                          <h4 className="font-medium text-gray-300 mb-1">
                            {activity.title}
                          </h4>
                          {activity.type === 'deployment' && (
                            <a
                              href={activity.data.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300 text-sm"
                            >
                              {activity.data.url}
                            </a>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          {activity.type === 'chat' && (
                            <button
                              onClick={() => handleSelectHistoryChat(activity.data)}
                              className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                            >
                              Load & Edit
                            </button>
                          )}
                          {activity.type === 'deployment' && (
                            <a
                              href={activity.data.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                            >
                              Visit
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Chat History with Deployments */}
            <div className="p-6 border-t border-gray-800/70">
              <h3 className="text-md font-semibold text-white mb-4">Chat History with Deployments</h3>
              {chatsWithDeployments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>Loading chat history...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {chatsWithDeployments.map((chat) => (
                    <div
                      key={chat.id}
                      className="border border-gray-800/70 rounded-lg p-4 hover:bg-gray-800/20 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-900/40 text-indigo-300 border border-indigo-700/50">
                              Chat #{chat.id}
                            </span>
                            <span className="text-sm text-gray-500">
                              {formatTimestamp(chat.timestamp)}
                            </span>
                            {chat.deployments && chat.deployments.length > 0 && (
                              <span className="px-2 py-1 rounded text-xs font-medium bg-green-900/40 text-green-300 border border-green-700/50">
                                {chat.deployments.length} deployment{chat.deployments.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <h4 className="font-medium text-gray-300 mb-2">
                            {chat.prompt.substring(0, 80)}{chat.prompt.length > 80 ? '...' : ''}
                          </h4>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleSelectHistoryChat(chat)}
                            className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                          >
                            Load & Edit
                          </button>
                        </div>
                      </div>
                      
                      {/* Associated Deployments */}
                      {chat.deployments && chat.deployments.length > 0 && (
                        <div className="ml-4 pl-4 border-l border-gray-700">
                          <h5 className="text-sm font-medium text-gray-400 mb-2">Associated Deployments:</h5>
                          <div className="space-y-2">
                            {chat.deployments.map((deployment) => (
                              <div key={deployment.id} className="bg-gray-900/60 p-3 rounded-lg">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-sm font-medium text-green-400">
                                        {deployment.projectName}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        {formatTimestamp(deployment.timestamp)}
                                      </span>
                                    </div>
                                    <a
                                      href={deployment.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-green-400 hover:text-green-300 text-sm block"
                                    >
                                      {deployment.url}
                                    </a>
                                  </div>
                                  <div className="flex gap-1 ml-2">
                                    <a
                                      href={deployment.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                                    >
                                      Visit
                                    </a>
                                    <button
                                      onClick={() => handleDownloadFromHistory(deployment, 'index.html')}
                                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                                    >
                                      Download
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Backup ZIP Files */}
            <div className="p-6 border-t border-gray-800/70">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-md font-semibold text-white">Backup ZIP Files</h3>
                <button
                  onClick={loadBackupList}
                  disabled={isLoadingBackups}
                  className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-500 disabled:opacity-50"
                >
                  {isLoadingBackups ? "Loading..." : "Refresh"}
                </button>
              </div>
              
              {isLoadingBackups ? (
                <div className="text-center py-8 text-gray-500">
                  <p>Loading backups...</p>
                </div>
              ) : backupList.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No backup files found.</p>
                  <p className="text-sm">Deploy something to create backup files!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {backupList.slice(0, 10).map((backup) => (
                    <div
                      key={backup.folder}
                      className="border border-gray-800/70 rounded-lg p-4 hover:bg-gray-800/20 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-1 rounded text-xs font-medium bg-purple-900/40 text-purple-300 border border-purple-700/50">
                              Backup
                            </span>
                            <span className="text-sm text-gray-500">
                              {formatTimestamp(backup.createdAt)}
                            </span>
                            <span className="px-2 py-1 rounded text-xs font-medium bg-orange-900/40 text-orange-300 border border-orange-700/50">
                              {backup.zipFiles.length} ZIP{backup.zipFiles.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <h4 className="font-medium text-gray-300 mb-2">
                            {backup.manifest?.projectName || backup.folder}
                          </h4>
                          {backup.manifest && (
                            <div className="text-xs text-gray-400 mb-2">
                              Files: {backup.manifest.files?.join(', ') || 'Unknown'}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* ZIP Files */}
                      {backup.zipFiles.length > 0 && (
                        <div className="ml-4 pl-4 border-l border-gray-700">
                          <h5 className="text-sm font-medium text-gray-400 mb-2">Available ZIP Files:</h5>
                          <div className="flex flex-wrap gap-2">
                            {backup.zipFiles.map((zipFile) => (
                              <button
                                key={zipFile}
                                onClick={() => handleDownloadBackupZip(backup, zipFile)}
                                className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 flex items-center gap-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {zipFile}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}


