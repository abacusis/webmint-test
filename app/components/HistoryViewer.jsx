import { useState, useEffect } from 'react';
import { useWebMintHistory, useChatSession } from '../hooks/useWebMintHistory';

export function HistoryViewer() {
  const {
    chats,
    deployments,
    isLoading,
    error,
    stats,
    loadHistory,
    deleteChat,
    searchChats,
    exportData,
    clearAllData,
    getRecentActivity
  } = useWebMintHistory();

  const [activeTab, setActiveTab] = useState('recent');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChat, setSelectedChat] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  // Load recent activity on mount
  useEffect(() => {
    loadRecentActivity();
  }, []);

  const loadRecentActivity = async () => {
    try {
      const activity = await getRecentActivity();
      setRecentActivity(activity);
    } catch (error) {
      console.error('Failed to load recent activity:', error);
    }
  };

  const handleSearch = async () => {
    if (searchTerm.trim()) {
      await searchChats(searchTerm);
      setActiveTab('chats');
    } else {
      await loadHistory();
    }
  };

  const handleDeleteChat = async (chatId) => {
    try {
      await deleteChat(chatId);
      setShowDeleteConfirm(null);
      await loadRecentActivity();
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  };

  const handleExportData = async () => {
    try {
      await exportData();
    } catch (error) {
      console.error('Failed to export data:', error);
    }
  };

  const handleClearAllData = async () => {
    if (window.confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      try {
        await clearAllData();
        await loadRecentActivity();
      } catch (error) {
        console.error('Failed to clear data:', error);
      }
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatPrompt = (prompt, maxLength = 60) => {
    return prompt.length > maxLength ? prompt.substring(0, maxLength) + '...' : prompt;
  };

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">Error loading history</h3>
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg">
        {/* Header */}
        <div className="border-b border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-gray-900">WebMint History</h1>
            <div className="flex gap-2">
              <button
                onClick={handleExportData}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                Export Data
              </button>
              <button
                onClick={handleClearAllData}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-600">{stats.totalChats}</div>
              <div className="text-sm text-blue-800">Total Chats</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-600">{stats.totalDeployments}</div>
              <div className="text-sm text-green-800">Deployments</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-purple-600">{recentActivity.length}</div>
              <div className="text-sm text-purple-800">Recent Items</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-600">
                {stats.totalChats > 0 ? Math.round(stats.totalDeployments / stats.totalChats * 100) : 0}%
              </div>
              <div className="text-sm text-gray-800">Deploy Rate</div>
            </div>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search chats by prompt..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Search
            </button>
            <button
              onClick={() => {
                setSearchTerm('');
                loadHistory();
              }}
              className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {['recent', 'chats', 'deployments'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-3 text-gray-600">Loading history...</span>
            </div>
          ) : (
            <>
              {/* Recent Activity Tab */}
              {activeTab === 'recent' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
                  {recentActivity.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <p>No recent activity found.</p>
                      <p className="text-sm">Start generating some content to see your history here!</p>
                    </div>
                  ) : (
                    recentActivity.map((activity) => (
                      <div
                        key={`${activity.type}-${activity.id}`}
                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                activity.type === 'chat' 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {activity.type}
                              </span>
                              <span className="text-sm text-gray-500">
                                {formatTimestamp(activity.timestamp)}
                              </span>
                            </div>
                            <h3 className="font-medium text-gray-900 mb-1">
                              {activity.title}
                            </h3>
                            {activity.type === 'deployment' && (
                              <a
                                href={activity.data.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 text-sm"
                              >
                                {activity.data.url}
                              </a>
                            )}
                          </div>
                          {activity.type === 'chat' && (
                            <button
                              onClick={() => setSelectedChat(activity.data)}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              View Details
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Chats Tab */}
              {activeTab === 'chats' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold mb-4">Chat History</h2>
                  {chats.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <p>No chats found.</p>
                      {searchTerm && <p className="text-sm">Try a different search term.</p>}
                    </div>
                  ) : (
                    chats.map((chat) => (
                      <div key={chat.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900 mb-2">
                              {formatPrompt(chat.prompt)}
                            </h3>
                            <div className="text-sm text-gray-500 space-y-1">
                              <p>Created: {formatTimestamp(chat.timestamp)}</p>
                              <p>
                                Content: {chat.metadata.htmlLength} HTML, {chat.metadata.cssLength} CSS, {chat.metadata.jsLength} JS chars
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <button
                              onClick={() => setSelectedChat(chat)}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                            >
                              View
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(chat.id)}
                              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Deployments Tab */}
              {activeTab === 'deployments' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold mb-4">Deployment History</h2>
                  {deployments.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <p>No deployments found.</p>
                      <p className="text-sm">Deploy some generated content to see your deployments here!</p>
                    </div>
                  ) : (
                    deployments.map((deployment) => (
                      <div key={deployment.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900 mb-2">
                              {deployment.projectName}
                            </h3>
                            <div className="space-y-1">
                              <a
                                href={deployment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 block"
                              >
                                {deployment.url}
                              </a>
                              <p className="text-sm text-gray-500">
                                Deployed: {formatTimestamp(deployment.timestamp)}
                              </p>
                              <p className="text-sm text-gray-500">
                                Status: <span className="capitalize">{deployment.status}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <a
                              href={deployment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                            >
                              Visit
                            </a>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chat Detail Modal */}
      {selectedChat && (
        <ChatDetailModal
          chat={selectedChat}
          onClose={() => setSelectedChat(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete Chat</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this chat and all its deployments? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteChat(showDeleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatDetailModal({ chat, onClose }) {
  const { chat: fullChat, isLoading } = useChatSession(chat.id);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span>Loading chat details...</span>
          </div>
        </div>
      </div>
    );
  }

  const chatData = fullChat || chat;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold">Chat Details</h2>
              <p className="text-gray-600 mt-1">
                Created: {new Date(chatData.timestamp).toLocaleString()}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Prompt */}
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Prompt</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-700">{chatData.prompt}</p>
            </div>
          </div>

          {/* Generated Content */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">
                HTML ({chatData.generatedContent?.html?.length || 0} chars)
              </h4>
              <textarea
                value={chatData.generatedContent?.html || ''}
                readOnly
                className="w-full h-40 p-3 border border-gray-300 rounded text-xs font-mono bg-gray-50"
              />
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900 mb-2">
                CSS ({chatData.generatedContent?.css?.length || 0} chars)
              </h4>
              <textarea
                value={chatData.generatedContent?.css || ''}
                readOnly
                className="w-full h-40 p-3 border border-gray-300 rounded text-xs font-mono bg-gray-50"
              />
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900 mb-2">
                JavaScript ({chatData.generatedContent?.js?.length || 0} chars)
              </h4>
              <textarea
                value={chatData.generatedContent?.js || ''}
                readOnly
                className="w-full h-40 p-3 border border-gray-300 rounded text-xs font-mono bg-gray-50"
              />
            </div>
          </div>

          {/* Deployments */}
          {chatData.deployments && chatData.deployments.length > 0 && (
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Deployments ({chatData.deployments.length})</h3>
              <div className="space-y-3">
                {chatData.deployments.map((deployment) => (
                  <div key={deployment.id} className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-green-800">{deployment.projectName}</h4>
                        <a
                          href={deployment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:text-green-800 text-sm"
                        >
                          {deployment.url}
                        </a>
                        <p className="text-sm text-green-700 mt-1">
                          Deployed: {new Date(deployment.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <a
                        href={deployment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                      >
                        Visit
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
