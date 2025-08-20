import { useState, useEffect, useCallback } from 'react';
import webMintDB from '../utils/indexdb.client';

/**
 * Custom hook for managing WebMint chat and deployment history
 * Provides state management and actions for IndexedDB operations
 */
export function useWebMintHistory() {
  const [chats, setChats] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ totalChats: 0, totalDeployments: 0 });

  // Load initial data
  useEffect(() => {
    loadHistory();
    loadStats();
  }, []);

  /**
   * Load chat and deployment history
   */
  const loadHistory = useCallback(async (options = {}) => {
    setIsLoading(true);
    setError(null);

    try {
      const [chatsData, deploymentsData] = await Promise.all([
        webMintDB.getChats(options),
        webMintDB.getDeployments(options)
      ]);

      setChats(chatsData);
      setDeployments(deploymentsData);
    } catch (err) {
      console.error('Failed to load history:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Load database statistics
   */
  const loadStats = useCallback(async () => {
    try {
      const statsData = await webMintDB.getStats();
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  /**
   * Save a new chat session
   * @param {string} prompt - User prompt
   * @param {Object} generatedContent - Generated HTML/CSS/JS
   * @param {string} status - Generation status
   * @returns {Promise<number>} Chat ID
   */
  const saveChat = useCallback(async (prompt, generatedContent, status = 'completed') => {
    try {
      const chatId = await webMintDB.saveChat({
        prompt,
        generatedContent,
        status,
        timestamp: Date.now()
      });

      // Reload history to update UI
      await loadHistory();
      await loadStats();

      return chatId;
    } catch (err) {
      console.error('Failed to save chat:', err);
      setError(err.message);
      throw err;
    }
  }, [loadHistory, loadStats]);

  /**
   * Save a deployment record
   * @param {number} chatId - Associated chat ID
   * @param {Object} deploymentData - Deployment information
   * @returns {Promise<number>} Deployment ID
   */
  const saveDeployment = useCallback(async (chatId, deploymentData) => {
    try {
      const deploymentId = await webMintDB.saveDeployment({
        chatId,
        projectName: deploymentData.projectName,
        url: deploymentData.url,
        deploymentId: deploymentData.id,
        timestamp: Date.now(),
        createdAt: deploymentData.createdAt
      });

      // Reload history to update UI
      await loadHistory();
      await loadStats();

      return deploymentId;
    } catch (err) {
      console.error('Failed to save deployment:', err);
      setError(err.message);
      throw err;
    }
  }, [loadHistory, loadStats]);

  /**
   * Delete a chat and its deployments
   * @param {number} chatId - Chat ID to delete
   */
  const deleteChat = useCallback(async (chatId) => {
    try {
      await webMintDB.deleteChat(chatId);
      
      // Reload history to update UI
      await loadHistory();
      await loadStats();
    } catch (err) {
      console.error('Failed to delete chat:', err);
      setError(err.message);
      throw err;
    }
  }, [loadHistory, loadStats]);

  /**
   * Get a specific chat with its deployments
   * @param {number} chatId - Chat ID
   * @returns {Promise<Object>} Chat with deployments
   */
  const getChatWithDeployments = useCallback(async (chatId) => {
    try {
      return await webMintDB.getChatWithDeployments(chatId);
    } catch (err) {
      console.error('Failed to get chat with deployments:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Update deployment status
   * @param {number} deploymentId - Deployment ID
   * @param {string} status - New status
   */
  const updateDeploymentStatus = useCallback(async (deploymentId, status) => {
    try {
      await webMintDB.updateDeploymentStatus(deploymentId, status);
      
      // Reload history to update UI
      await loadHistory();
    } catch (err) {
      console.error('Failed to update deployment status:', err);
      setError(err.message);
      throw err;
    }
  }, [loadHistory]);

  /**
   * Search chats by prompt text
   * @param {string} searchTerm - Search term
   * @param {number} limit - Maximum results
   */
  const searchChats = useCallback(async (searchTerm, limit = 20) => {
    setIsLoading(true);
    setError(null);

    try {
      const results = await webMintDB.getChats({
        searchTerm,
        limit
      });
      
      setChats(results);
    } catch (err) {
      console.error('Failed to search chats:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Clear all data (for development/testing)
   */
  const clearAllData = useCallback(async () => {
    try {
      await webMintDB.clearAll();
      
      // Reset state
      setChats([]);
      setDeployments([]);
      setStats({ totalChats: 0, totalDeployments: 0 });
    } catch (err) {
      console.error('Failed to clear all data:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Export data as JSON (for backup)
   */
  const exportData = useCallback(async () => {
    try {
      const [allChats, allDeployments] = await Promise.all([
        webMintDB.getChats(),
        webMintDB.getDeployments()
      ]);

      const exportData = {
        version: '1.0',
        timestamp: Date.now(),
        chats: allChats,
        deployments: allDeployments,
        stats: await webMintDB.getStats()
      };

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webmint-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return exportData;
    } catch (err) {
      console.error('Failed to export data:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Get recent activity (last 10 chats and deployments)
   */
  const getRecentActivity = useCallback(async () => {
    try {
      const [recentChats, recentDeployments] = await Promise.all([
        webMintDB.getChats({ limit: 10 }),
        webMintDB.getDeployments({ limit: 10 })
      ]);

      // Combine and sort by timestamp
      const activities = [
        ...recentChats.map(chat => ({
          type: 'chat',
          id: chat.id,
          timestamp: chat.timestamp,
          title: chat.prompt.substring(0, 50) + (chat.prompt.length > 50 ? '...' : ''),
          data: chat
        })),
        ...recentDeployments.map(deployment => ({
          type: 'deployment',
          id: deployment.id,
          timestamp: deployment.timestamp,
          title: `Deployed ${deployment.projectName}`,
          data: deployment
        }))
      ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);

      return activities;
    } catch (err) {
      console.error('Failed to get recent activity:', err);
      throw err;
    }
  }, []);

  return {
    // State
    chats,
    deployments,
    isLoading,
    error,
    stats,

    // Actions
    loadHistory,
    loadStats,
    saveChat,
    saveDeployment,
    deleteChat,
    getChatWithDeployments,
    updateDeploymentStatus,
    searchChats,
    clearAllData,
    exportData,
    getRecentActivity,

    // Utilities
    refresh: () => Promise.all([loadHistory(), loadStats()]),
    clearError: () => setError(null)
  };
}

/**
 * Hook for managing a single chat session
 * @param {number} chatId - Chat ID to manage
 */
export function useChatSession(chatId) {
  const [chat, setChat] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadChat = useCallback(async () => {
    if (!chatId) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const chatData = await webMintDB.getChatWithDeployments(chatId);
      setChat(chatData);
    } catch (err) {
      console.error('Failed to load chat:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  return {
    chat,
    isLoading,
    error,
    reload: loadChat,
    clearError: () => setError(null)
  };
}
