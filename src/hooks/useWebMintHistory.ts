import { useState, useEffect, useCallback } from 'react';
import webMintStorage, { type ChatData, type DeploymentData } from '@/lib/local-storage';

type Chat = ChatData & { id: number; metadata?: Record<string, unknown> };
type Deployment = DeploymentData & { id: number; metadata?: Record<string, unknown> };

interface Stats {
  totalChats: number;
  totalDeployments: number;
  dbName: string;
  dbVersion: number;
}

interface QueryOptions {
  limit?: number;
  status?: string;
  searchTerm?: string;
}

/**
 * Custom hook for managing WebMint chat and deployment history
 * Provides state management and actions for IndexedDB operations
 */
export function useWebMintHistory() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({ totalChats: 0, totalDeployments: 0, dbName: '', dbVersion: 0 });

  /**
   * Load chat and deployment history
   */
  const loadHistory = useCallback(async (options: QueryOptions = {}) => {
    setIsLoading(true);
    setError(null);

    try {
      const [chatsData, deploymentsData] = await Promise.all([
        webMintStorage.getChats(options),
        webMintStorage.getDeployments(options)
      ]);

      setChats(chatsData as Chat[]);
      setDeployments(deploymentsData as unknown as Deployment[]);
    } catch (err: unknown) {
      console.error('Failed to load history:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Load database statistics
   */
  const loadStats = useCallback(async () => {
    try {
      const statsData = await webMintStorage.getStats();
      setStats(statsData);
    } catch (err: unknown) {
      console.error('Failed to load stats:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  /**
   * Save a new chat session
   */
  const saveChat = useCallback(async (chatData: {
    prompt: string;
    generatedContent: {
      html: string;
      css: string;
      js: string;
    };
    projectAlias?: string;
    status?: string;
    timestamp?: number;
  }) => {
    try {
      const chatId = await webMintStorage.saveChat(chatData);
      
      // Reload history to include the new chat
      await loadHistory();
      await loadStats();
      
      return chatId;
    } catch (err: unknown) {
      console.error('Failed to save chat:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  }, [loadHistory, loadStats]);

  /**
   * Save a new deployment record
   */
  const saveDeployment = useCallback(async (deploymentData: Omit<DeploymentData, 'id'>) => {
    try {
      const deploymentId = await webMintStorage.saveDeployment(deploymentData as DeploymentData);
      
      // Reload history to include the new deployment
      await loadHistory();
      await loadStats();
      
      return deploymentId;
    } catch (err: unknown) {
      console.error('Failed to save deployment:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  }, [loadHistory, loadStats]);

  /**
   * Search chats by prompt content
   */
  const searchChats = useCallback(async (searchTerm: string, options: QueryOptions = {}) => {
    setIsLoading(true);
    setError(null);

    try {
      const chatsData = await webMintStorage.getChats({
        ...options,
        searchTerm
      });

      setChats(chatsData as Chat[]);
      return chatsData;
    } catch (err: unknown) {
      console.error('Failed to search chats:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get recent activity (chats and deployments combined)
   */
  const getRecentActivity = useCallback(async (limit: number = 10) => {
    try {
      const [recentChats, recentDeployments] = await Promise.all([
        webMintStorage.getChats({ limit: Math.ceil(limit / 2) }),
        webMintStorage.getDeployments({ limit: Math.ceil(limit / 2) })
      ]);

      // Combine and sort by timestamp
      const combined = [
        ...recentChats.map(chat => ({ ...chat, type: 'chat' })),
        ...recentDeployments.map(deployment => ({ ...deployment, type: 'deployment' }))
      ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, limit);

      return combined;
    } catch (err: unknown) {
      console.error('Failed to get recent activity:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return [];
    }
  }, []);

  /**
   * Get chat with its deployments
   */
  const getChatWithDeployments = useCallback(async (chatId: number) => {
    try {
      const chatWithDeployments = await webMintStorage.getChatWithDeployments(chatId);
      return chatWithDeployments;
    } catch (err: unknown) {
      console.error('Failed to get chat with deployments:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, []);

  /**
   * Delete a chat and its associated deployments
   */
  const deleteChat = useCallback(async (chatId: number) => {
    try {
      await webMintStorage.deleteChat(chatId);
      
      // Reload history to reflect the deletion
      await loadHistory();
      await loadStats();
      
      return true;
    } catch (err: unknown) {
      console.error('Failed to delete chat:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, [loadHistory, loadStats]);

  /**
   * Update deployment status
   */
  const updateDeploymentStatus = useCallback(async (deploymentId: string, status: string) => {
    try {
      await webMintStorage.updateDeploymentStatus(deploymentId, status);
      
      // Reload history to reflect the update
      await loadHistory();
      
      return true;
      } catch (err: unknown) {
      console.error('Failed to update deployment status:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, [loadHistory]);

  /**
   * Clear all history data (for development/testing)
   */
  const clearAll = useCallback(async () => {
    try {
      await webMintStorage.clearAll();
      
      // Reset state
      setChats([]);
      setDeployments([]);
      setStats({ totalChats: 0, totalDeployments: 0, dbName: '', dbVersion: 0 });
      
      return true;
    } catch (err: unknown) {
      console.error('Failed to clear all data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, []);

  /**
   * Refresh all data
   */
  const refresh = useCallback(async () => {
    await Promise.all([
      loadHistory(),
      loadStats()
    ]);
  }, [loadHistory, loadStats]);

  // Load initial data
  useEffect(() => {
    void loadHistory();
    void loadStats();
  }, [loadHistory, loadStats]);

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
    searchChats,
    getRecentActivity,
    getChatWithDeployments,
    deleteChat,
    updateDeploymentStatus,
    clearAll,
    refresh,
    
    // Utilities
    clearError: () => setError(null)
  };
}
