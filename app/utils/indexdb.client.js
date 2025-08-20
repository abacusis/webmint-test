/**
 * IndexedDB service for storing chat history and deployment links
 * Provides persistent local storage for user sessions
 */

const DB_NAME = 'WebMintDB';
const DB_VERSION = 1;
const CHATS_STORE = 'chats';
const DEPLOYMENTS_STORE = 'deployments';

class WebMintDB {
  constructor() {
    this.db = null;
    this.initPromise = this.init();
  }

  /**
   * Initialize the IndexedDB database
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create chats store
        if (!db.objectStoreNames.contains(CHATS_STORE)) {
          const chatsStore = db.createObjectStore(CHATS_STORE, {
            keyPath: 'id',
            autoIncrement: true
          });
          
          // Create indexes for efficient querying
          chatsStore.createIndex('timestamp', 'timestamp', { unique: false });
          chatsStore.createIndex('prompt', 'prompt', { unique: false });
          chatsStore.createIndex('status', 'status', { unique: false });
        }

        // Create deployments store
        if (!db.objectStoreNames.contains(DEPLOYMENTS_STORE)) {
          const deploymentsStore = db.createObjectStore(DEPLOYMENTS_STORE, {
            keyPath: 'id',
            autoIncrement: true
          });
          
          // Create indexes
          deploymentsStore.createIndex('chatId', 'chatId', { unique: false });
          deploymentsStore.createIndex('projectName', 'projectName', { unique: false });
          deploymentsStore.createIndex('timestamp', 'timestamp', { unique: false });
          deploymentsStore.createIndex('url', 'url', { unique: false });
        }

        console.log('IndexedDB schema created/updated');
      };
    });
  }

  /**
   * Ensure database is ready before operations
   */
  async ensureReady() {
    if (!this.db) {
      await this.initPromise;
    }
    return this.db;
  }

  /**
   * Save a chat session
   * @param {Object} chatData - Chat session data
   * @param {string} chatData.prompt - User prompt
   * @param {Object} chatData.generatedContent - Generated HTML/CSS/JS
   * @param {string} chatData.status - Generation status
   * @param {number} chatData.timestamp - Creation timestamp
   * @returns {Promise<number>} Chat ID
   */
  async saveChat(chatData) {
    await this.ensureReady();

    const chat = {
      prompt: chatData.prompt,
      generatedContent: {
        html: chatData.generatedContent.html || '',
        css: chatData.generatedContent.css || '',
        js: chatData.generatedContent.js || ''
      },
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

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CHATS_STORE], 'readwrite');
      const store = transaction.objectStore(CHATS_STORE);
      const request = store.add(chat);

      request.onsuccess = () => {
        console.log('Chat saved with ID:', request.result);
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('Failed to save chat:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Save a deployment record
   * @param {Object} deploymentData - Deployment data
   * @param {number} deploymentData.chatId - Associated chat ID
   * @param {string} deploymentData.projectName - CloudFlare project name
   * @param {string} deploymentData.url - Deployment URL
   * @param {string} deploymentData.deploymentId - CloudFlare deployment ID
   * @param {number} deploymentData.timestamp - Deployment timestamp
   * @returns {Promise<number>} Deployment ID
   */
  async saveDeployment(deploymentData) {
    await this.ensureReady();

    const deployment = {
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

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DEPLOYMENTS_STORE], 'readwrite');
      const store = transaction.objectStore(DEPLOYMENTS_STORE);
      const request = store.add(deployment);

      request.onsuccess = () => {
        console.log('Deployment saved with ID:', request.result);
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('Failed to save deployment:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all chats with optional filtering
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum number of results
   * @param {string} options.status - Filter by status
   * @param {string} options.searchTerm - Search in prompts
   * @returns {Promise<Array>} Array of chat records
   */
  async getChats(options = {}) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CHATS_STORE], 'readonly');
      const store = transaction.objectStore(CHATS_STORE);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev'); // Most recent first

      const results = [];
      let count = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        
        if (!cursor || (options.limit && count >= options.limit)) {
          resolve(results);
          return;
        }

        const chat = cursor.value;
        
        // Apply filters
        if (options.status && chat.status !== options.status) {
          cursor.continue();
          return;
        }

        if (options.searchTerm && !chat.prompt.toLowerCase().includes(options.searchTerm.toLowerCase())) {
          cursor.continue();
          return;
        }

        results.push(chat);
        count++;
        cursor.continue();
      };

      request.onerror = () => {
        console.error('Failed to get chats:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all deployments for a specific chat
   * @param {number} chatId - Chat ID
   * @returns {Promise<Array>} Array of deployment records
   */
  async getDeploymentsByChat(chatId) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DEPLOYMENTS_STORE], 'readonly');
      const store = transaction.objectStore(DEPLOYMENTS_STORE);
      const index = store.index('chatId');
      const request = index.getAll(chatId);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('Failed to get deployments:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all deployments with optional filtering
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum number of results
   * @param {string} options.status - Filter by status
   * @returns {Promise<Array>} Array of deployment records
   */
  async getDeployments(options = {}) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DEPLOYMENTS_STORE], 'readonly');
      const store = transaction.objectStore(DEPLOYMENTS_STORE);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev'); // Most recent first

      const results = [];
      let count = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        
        if (!cursor || (options.limit && count >= options.limit)) {
          resolve(results);
          return;
        }

        const deployment = cursor.value;
        
        // Apply filters
        if (options.status && deployment.status !== options.status) {
          cursor.continue();
          return;
        }

        results.push(deployment);
        count++;
        cursor.continue();
      };

      request.onerror = () => {
        console.error('Failed to get deployments:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get chat with its deployments
   * @param {number} chatId - Chat ID
   * @returns {Promise<Object>} Chat record with deployments
   */
  async getChatWithDeployments(chatId) {
    await this.ensureReady();

    const chat = await new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CHATS_STORE], 'readonly');
      const store = transaction.objectStore(CHATS_STORE);
      const request = store.get(chatId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

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
   * @param {number} chatId - Chat ID
   * @returns {Promise<void>}
   */
  async deleteChat(chatId) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CHATS_STORE, DEPLOYMENTS_STORE], 'readwrite');
      
      // Delete chat
      const chatsStore = transaction.objectStore(CHATS_STORE);
      chatsStore.delete(chatId);

      // Delete associated deployments
      const deploymentsStore = transaction.objectStore(DEPLOYMENTS_STORE);
      const index = deploymentsStore.index('chatId');
      const request = index.openCursor(IDBKeyRange.only(chatId));

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        console.log('Chat and deployments deleted');
        resolve();
      };

      transaction.onerror = () => {
        console.error('Failed to delete chat:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Update deployment status
   * @param {number} deploymentId - Deployment ID
   * @param {string} status - New status
   * @returns {Promise<void>}
   */
  async updateDeploymentStatus(deploymentId, status) {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DEPLOYMENTS_STORE], 'readwrite');
      const store = transaction.objectStore(DEPLOYMENTS_STORE);
      const request = store.get(deploymentId);

      request.onsuccess = () => {
        const deployment = request.result;
        if (deployment) {
          deployment.status = status;
          deployment.updatedAt = Date.now();
          
          const updateRequest = store.put(deployment);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error('Deployment not found'));
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>} Database statistics
   */
  async getStats() {
    await this.ensureReady();

    const chatsCount = await new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CHATS_STORE], 'readonly');
      const store = transaction.objectStore(CHATS_STORE);
      const request = store.count();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const deploymentsCount = await new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DEPLOYMENTS_STORE], 'readonly');
      const store = transaction.objectStore(DEPLOYMENTS_STORE);
      const request = store.count();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return {
      totalChats: chatsCount,
      totalDeployments: deploymentsCount,
      dbName: DB_NAME,
      dbVersion: DB_VERSION
    };
  }

  /**
   * Clear all data (for development/testing)
   * @returns {Promise<void>}
   */
  async clearAll() {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([CHATS_STORE, DEPLOYMENTS_STORE], 'readwrite');
      
      transaction.objectStore(CHATS_STORE).clear();
      transaction.objectStore(DEPLOYMENTS_STORE).clear();

      transaction.oncomplete = () => {
        console.log('All data cleared');
        resolve();
      };

      transaction.onerror = () => {
        console.error('Failed to clear data:', transaction.error);
        reject(transaction.error);
      };
    });
  }
}

// Create singleton instance
const webMintDB = new WebMintDB();

export default webMintDB;

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
} = webMintDB;
