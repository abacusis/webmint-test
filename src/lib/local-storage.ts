/**
 * Local Storage service for storing chat history and deployment links
 * Provides persistent local storage for user sessions using localStorage
 */

export interface ChatData {
  prompt: string;
  generatedContent: {
    html: string;
    css: string;
    js: string;
  };
  projectAlias?: string; // User-defined alias for CloudFlare project
  status?: string;
  timestamp?: number;
}

export interface DeploymentData {
  chatId: number;
  projectName: string;
  url: string;
  deploymentId: string;
  timestamp?: number;
  status?: string;
  createdAt?: string;
}

interface QueryOptions {
  limit?: number;
  status?: string;
  searchTerm?: string;
}

class WebMintStorage {
  private readonly CHATS_KEY = 'webmint_chats';
  private readonly DEPLOYMENTS_KEY = 'webmint_deployments';
  private readonly STATS_KEY = 'webmint_stats';

  /**
   * Save a chat session
   */
  async saveChat(chatData: ChatData): Promise<number> {
    const chats = this.getChatsFromStorage();
    const id = Date.now(); // Simple ID generation
    
    const chat = {
      id,
      prompt: chatData.prompt,
      generatedContent: {
        html: chatData.generatedContent.html || '',
        css: chatData.generatedContent.css || '',
        js: chatData.generatedContent.js || ''
      },
      projectAlias: chatData.projectAlias || '', // Store the project alias
      status: chatData.status || 'completed',
      timestamp: chatData.timestamp || Date.now(),
      metadata: {
        htmlLength: (chatData.generatedContent.html || '').length,
        cssLength: (chatData.generatedContent.css || '').length,
        jsLength: (chatData.generatedContent.js || '').length,
        totalLength: (chatData.generatedContent.html || '').length + 
                    (chatData.generatedContent.css || '').length + 
                    (chatData.generatedContent.js || '').length
      }
    };

    chats.push(chat);
    localStorage.setItem(this.CHATS_KEY, JSON.stringify(chats));
    this.updateStats();
    
    console.log('Chat saved with ID:', id);
    return id;
  }

  /**
   * Save a deployment record
   */
  async saveDeployment(deploymentData: DeploymentData): Promise<number> {
    const deployments = this.getDeploymentsFromStorage();
    const id = Date.now(); // Simple ID generation
    
    const deployment = {
      id,
      chatId: deploymentData.chatId,
      projectName: deploymentData.projectName,
      url: deploymentData.url,
      deploymentId: deploymentData.deploymentId,
      timestamp: deploymentData.timestamp || Date.now(),
      status: deploymentData.status || 'active',
      metadata: {
        domain: new URL(deploymentData.url).hostname,
        createdAt: deploymentData.createdAt || new Date().toISOString()
      }
    };

    deployments.push(deployment);
    localStorage.setItem(this.DEPLOYMENTS_KEY, JSON.stringify(deployments));
    this.updateStats();
    
    console.log('Deployment saved with ID:', id);
    return id;
  }

  /**
   * Get all chats with optional filtering
   */
  async getChats(options: QueryOptions = {}): Promise<ChatData[]> {
    let chats = this.getChatsFromStorage();
    
    // Apply filters
    if (options.status) {
      chats = chats.filter(chat => chat.status === options.status);
    }
    
    if (options.searchTerm) {
      chats = chats.filter(chat => 
        chat.prompt.toLowerCase().includes(options.searchTerm!.toLowerCase())
      );
    }
    
    // Sort by timestamp (most recent first)
    chats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    // Apply limit
    if (options.limit) {
      chats = chats.slice(0, options.limit);
    }
    
    return chats;
  }

  /**
   * Get all deployments for a specific chat
   */
  async getDeploymentsByChat(chatId: number): Promise<DeploymentData[]> {
    const deployments = this.getDeploymentsFromStorage();
    return deployments.filter(deployment => deployment.chatId === chatId);
  }

  /**
   * Get all deployments with optional filtering
   */
  async getDeployments(options: QueryOptions = {}): Promise<DeploymentData[]> {
    let deployments = this.getDeploymentsFromStorage();
    
    // Apply filters
    if (options.status) {
      deployments = deployments.filter(deployment => deployment.status === options.status);
    }
    
    // Sort by timestamp (most recent first)
    deployments.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    // Apply limit
    if (options.limit) {
      deployments = deployments.slice(0, options.limit);
    }
    
    return deployments;
  }

  /**
   * Get chat with its deployments
   */
  async getChatWithDeployments(chatId: number): Promise<ChatData & { deployments: DeploymentData[] }> {
    const chats = this.getChatsFromStorage();
    const chat = chats.find(c => c.id === chatId);
    
    if (!chat) {
      throw new Error('Chat not found');
    }
    
    const deployments = await this.getDeploymentsByChat(chatId);
    
    return {
      ...chat,
      deployments
    };
  }

  /**
   * Delete a chat and its deployments
   */
  async deleteChat(chatId: number): Promise<void> {
    const chats = this.getChatsFromStorage();
    const deployments = this.getDeploymentsFromStorage();
    
    // Remove chat
    const filteredChats = chats.filter(chat => chat.id !== chatId);
    localStorage.setItem(this.CHATS_KEY, JSON.stringify(filteredChats));
    
    // Remove associated deployments
    const filteredDeployments = deployments.filter(deployment => deployment.chatId !== chatId);
    localStorage.setItem(this.DEPLOYMENTS_KEY, JSON.stringify(filteredDeployments));
    
    this.updateStats();
    console.log('Chat and deployments deleted');
  }

  /**
   * Update deployment status
   */
  async updateDeploymentStatus(deploymentId: string, status: string): Promise<void> {
    const deployments = this.getDeploymentsFromStorage();
    const deployment = deployments.find(d => d.deploymentId === deploymentId);
    
    if (deployment) {
      deployment.status = status;
      deployment.timestamp = Date.now();
      localStorage.setItem(this.DEPLOYMENTS_KEY, JSON.stringify(deployments));
    } else {
      throw new Error('Deployment not found');
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalChats: number;
    totalDeployments: number;
    dbName: string;
    dbVersion: number;
  }> {
    const chats = this.getChatsFromStorage();
    const deployments = this.getDeploymentsFromStorage();
    
    return {
      totalChats: chats.length,
      totalDeployments: deployments.length,
      dbName: 'localStorage',
      dbVersion: 1
    };
  }

  /**
   * Clear all data (for development/testing)
   */
  async clearAll(): Promise<void> {
    localStorage.removeItem(this.CHATS_KEY);
    localStorage.removeItem(this.DEPLOYMENTS_KEY);
    localStorage.removeItem(this.STATS_KEY);
    console.log('All data cleared');
  }

  /**
   * Private helper methods
   */
  private getChatsFromStorage(): Array<ChatData & { id: number; metadata?: Record<string, unknown> }> {
    const stored = localStorage.getItem(this.CHATS_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  private getDeploymentsFromStorage(): Array<DeploymentData & { id: number; metadata?: Record<string, unknown> }> {
    const stored = localStorage.getItem(this.DEPLOYMENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  private updateStats(): void {
    const stats = {
      totalChats: this.getChatsFromStorage().length,
      totalDeployments: this.getDeploymentsFromStorage().length,
      lastUpdated: Date.now()
    };
    localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
  }
}

// Create singleton instance
const webMintStorage = new WebMintStorage();

export default webMintStorage;

// Export individual methods for convenience
export const {
  saveChat,
  saveDeployment,
  getChats,
  getDeployments,
  getChatWithDeployments,
  getDeploymentsByChat,
  deleteChat,
  updateDeploymentStatus,
  getStats,
  clearAll
} = webMintStorage;