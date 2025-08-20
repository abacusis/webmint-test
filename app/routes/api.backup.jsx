import { json } from "@remix-run/cloudflare";
import { loadServerEnv } from "../utils/env.server";
import fs from 'fs';
import path from 'path';

/**
 * Download backup ZIP files
 * GET /api/backup?list=true - List all backup folders
 * GET /api/backup?folder=backup-folder-name&file=filename.zip - Download specific ZIP
 */
export async function loader({ request, context }) {
  try {
    loadServerEnv();
    
    const url = new URL(request.url);
    const listBackups = url.searchParams.get('list');
    const folderName = url.searchParams.get('folder');
    const fileName = url.searchParams.get('file');

    const backupsDir = path.join(process.cwd(), 'backups');

    if (listBackups === 'true') {
      // List all backup folders
      try {
        const folders = await fs.promises.readdir(backupsDir);
        const backupList = [];

        for (const folder of folders) {
          const folderPath = path.join(backupsDir, folder);
          const stat = await fs.promises.stat(folderPath);
          
          if (stat.isDirectory()) {
            try {
              // Read manifest.json if it exists
              const manifestPath = path.join(folderPath, 'manifest.json');
              let manifest = null;
              try {
                const manifestContent = await fs.promises.readFile(manifestPath, 'utf8');
                manifest = JSON.parse(manifestContent);
              } catch (e) {
                // Manifest doesn't exist or is invalid
              }

              // List ZIP files in the folder
              const files = await fs.promises.readdir(folderPath);
              const zipFiles = files.filter(f => f.endsWith('.zip'));

              backupList.push({
                folder: folder,
                createdAt: stat.mtime,
                manifest: manifest,
                zipFiles: zipFiles,
                path: folderPath
              });
            } catch (error) {
              console.error(`Error reading backup folder ${folder}:`, error);
            }
          }
        }

        // Sort by creation date (newest first)
        backupList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return json({
          success: true,
          backups: backupList,
          total: backupList.length
        });

      } catch (error) {
        return json({
          success: false,
          error: 'Failed to read backups directory',
          details: error.message
        }, { status: 500 });
      }
    }

    if (folderName && fileName) {
      // Download specific ZIP file
      const filePath = path.join(backupsDir, folderName, fileName);
      
      try {
        // Check if file exists
        await fs.promises.access(filePath);
        
        // Read file
        const fileBuffer = await fs.promises.readFile(filePath);
        
        return new Response(fileBuffer, {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': fileBuffer.length.toString()
          }
        });

      } catch (error) {
        return json({
          success: false,
          error: 'Backup file not found',
          details: error.message
        }, { status: 404 });
      }
    }

    return json({
      success: false,
      error: 'Invalid request. Use ?list=true to list backups or ?folder=name&file=name.zip to download'
    }, { status: 400 });

  } catch (error) {
    console.error('Backup API error:', error);
    return json({ 
      error: error.message || 'Failed to process backup request',
      details: error.stack 
    }, { status: 500 });
  }
}

/**
 * Create or manage backups
 * POST /api/backup with { action: "cleanup", olderThan: "7d" }
 */
export async function action({ request, context }) {
  try {
    loadServerEnv();
    
    const body = await request.json();
    const { action, olderThan } = body;

    if (action === 'cleanup') {
      // Clean up old backups
      const backupsDir = path.join(process.cwd(), 'backups');
      const cutoffDate = new Date();
      
      // Parse olderThan (e.g., "7d", "30d", "1h")
      const match = olderThan?.match(/^(\d+)([dhm])$/);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];
        
        switch (unit) {
          case 'd':
            cutoffDate.setDate(cutoffDate.getDate() - value);
            break;
          case 'h':
            cutoffDate.setHours(cutoffDate.getHours() - value);
            break;
          case 'm':
            cutoffDate.setMinutes(cutoffDate.getMinutes() - value);
            break;
        }
      } else {
        // Default to 7 days
        cutoffDate.setDate(cutoffDate.getDate() - 7);
      }

      try {
        const folders = await fs.promises.readdir(backupsDir);
        let deletedCount = 0;

        for (const folder of folders) {
          const folderPath = path.join(backupsDir, folder);
          const stat = await fs.promises.stat(folderPath);
          
          if (stat.isDirectory() && stat.mtime < cutoffDate) {
            await fs.promises.rm(folderPath, { recursive: true });
            deletedCount++;
            console.log(`Deleted old backup: ${folder}`);
          }
        }

        return json({
          success: true,
          message: `Cleaned up ${deletedCount} old backup folders`,
          deletedCount: deletedCount,
          cutoffDate: cutoffDate.toISOString()
        });

      } catch (error) {
        return json({
          success: false,
          error: 'Failed to cleanup backups',
          details: error.message
        }, { status: 500 });
      }
    }

    return json({
      success: false,
      error: 'Invalid action. Supported actions: cleanup'
    }, { status: 400 });

  } catch (error) {
    console.error('Backup action error:', error);
    return json({ 
      error: error.message || 'Failed to process backup action',
      details: error.stack 
    }, { status: 500 });
  }
}
