'use client';

import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { api } from '@/lib/api';

interface FileNode {
  id: string;
  path: string;
  filename: string;
  is_directory: boolean;
  children?: FileNode[];
}

interface FileTreeProps {
  projectId: string;
  onFileSelect: (path: string) => void;
  selectedPath?: string;
}

// Create a hash of the file list for comparison
function createFileHash(files: any[]): string {
  return files.map(f => `${f.path}:${f.id}:${f.is_directory}`).join('|');
}

// Deep comparison to check if tree structure changed
function hasTreeChanged(oldNodes: FileNode[], newFiles: any[], path: string): boolean {
  const oldHash = oldNodes.map(n => `${n.path}:${n.id}`).sort().join('|');
  const newHash = newFiles.map(f => `${f.path}:${f.id}`).sort().join('|');
  return oldHash !== newHash;
}

export function FileTree({ projectId, onFileSelect, selectedPath }: FileTreeProps) {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['/']));
  const [loading, setLoading] = useState(true);
  const expandedDirsRef = useRef<Set<string>>(new Set(['/']));

  // Cache directory contents to avoid unnecessary updates
  const directoryCacheRef = useRef<Map<string, string>>(new Map());
  const loadQueueRef = useRef<Set<string>>(new Set());
  const isLoadingRef = useRef<boolean>(false);

  // Keep ref in sync with state
  useEffect(() => {
    expandedDirsRef.current = expandedDirs;
  }, [expandedDirs]);

  // Update tree node only if content changed
  const updateTreeNode = useCallback((nodes: FileNode[], targetPath: string, newChildren: any[]): FileNode[] => {
    let updated = false;

    const result = nodes.map(node => {
      if (node.path === targetPath) {
        // Check if children actually changed
        if (!node.children || hasTreeChanged(node.children, newChildren, targetPath)) {
          updated = true;
          return {
            ...node,
            children: newChildren.map((f: any) => ({
              id: f.id,
              path: f.path,
              filename: f.filename,
              is_directory: f.is_directory,
              children: f.is_directory ? (node.children?.find(c => c.path === f.path)?.children || []) : undefined
            }))
          };
        }
        return node; // No change, return same reference
      } else if (node.is_directory && node.children) {
        const updatedChildren = updateTreeNode(node.children, targetPath, newChildren);
        if (updatedChildren !== node.children) {
          updated = true;
          return { ...node, children: updatedChildren };
        }
        return node;
      }
      return node;
    });

    return updated ? result : nodes; // Return same reference if nothing changed
  }, []);

  // Background loader - doesn't trigger re-renders unless data changed
  const loadDirectoryInBackground = useCallback(async (path: string) => {
    try {
      const response = await api.listDirectory(projectId, path);
      if (response.files) {
        const newHash = createFileHash(response.files);
        const oldHash = directoryCacheRef.current.get(path);

        // Only update if content actually changed
        if (newHash !== oldHash) {
          directoryCacheRef.current.set(path, newHash);

          setFileTree(prevTree => {
            if (path === '/') {
              // Check if root changed
              if (hasTreeChanged(prevTree, response.files, path)) {
                return response.files.map((f: any) => {
                  const existingNode = prevTree.find(n => n.path === f.path);
                  return {
                    id: f.id,
                    path: f.path,
                    filename: f.filename,
                    is_directory: f.is_directory,
                    children: f.is_directory ? (existingNode?.children || []) : undefined
                  };
                });
              }
              return prevTree; // No change
            } else {
              // Update specific directory
              return updateTreeNode(prevTree, path, response.files);
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to load directory:', error);
    }
  }, [projectId, updateTreeNode]);

  // Process load queue in background
  const processLoadQueue = useCallback(async () => {
    if (isLoadingRef.current || loadQueueRef.current.size === 0) {
      return;
    }

    isLoadingRef.current = true;
    const paths = Array.from(loadQueueRef.current);
    loadQueueRef.current.clear();

    // Load all queued paths in background (doesn't block UI)
    await Promise.all(paths.map(path => loadDirectoryInBackground(path)));

    isLoadingRef.current = false;
  }, [loadDirectoryInBackground]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      await loadDirectoryInBackground('/');
      setLoading(false);
    };
    init();
  }, [loadDirectoryInBackground]);

  // Background refresh - only updates changed files
  useEffect(() => {
    const interval = setInterval(() => {
      // Queue all expanded directories for background refresh
      loadQueueRef.current.add('/');
      for (const dirPath of expandedDirsRef.current) {
        if (dirPath !== '/') {
          loadQueueRef.current.add(dirPath);
        }
      }
      processLoadQueue();
    }, 5000); // Can be more frequent since it only updates changes

    return () => clearInterval(interval);
  }, [processLoadQueue]);

  const toggleDirectory = useCallback(async (path: string) => {
    const newExpanded = new Set(expandedDirs);

    if (newExpanded.has(path)) {
      // Collapse - instant, no API call
      newExpanded.delete(path);
      setExpandedDirs(newExpanded);
    } else {
      // Expand - instant UI update
      newExpanded.add(path);
      setExpandedDirs(newExpanded);

      // Load in background (won't re-render if data already cached)
      loadQueueRef.current.add(path);
      processLoadQueue();
    }
  }, [expandedDirs, processLoadQueue]);

  const handleNodeClick = useCallback((node: FileNode) => {
    if (node.is_directory) {
      toggleDirectory(node.path);
    } else {
      onFileSelect(node.path);
    }
  }, [toggleDirectory, onFileSelect]);

  const renderNode = useCallback((node: FileNode, level: number = 0) => {
    const isExpanded = expandedDirs.has(node.path);
    const isSelected = selectedPath === node.path;

    return (
      <div key={node.path}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingTop: 'var(--vf-space-1)',
            paddingBottom: 'var(--vf-space-1)',
            paddingLeft: `calc(${level * 16 + 8}px)`,
            paddingRight: 'var(--vf-space-2)',
            cursor: 'pointer',
            background: isSelected ? 'var(--vf-accent-primary)' : 'transparent',
            color: isSelected ? 'var(--vf-bg-primary)' : 'var(--vf-text-primary)',
            fontWeight: isSelected ? 'var(--vf-weight-bold)' : 'var(--vf-weight-normal)',
            transition: 'background 0.1s ease, color 0.1s ease',
            borderLeft: isSelected ? '2px solid var(--vf-accent-primary)' : '2px solid transparent',
          }}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.currentTarget.style.background = 'var(--vf-bg-secondary)';
              e.currentTarget.style.borderLeftColor = 'var(--vf-border-secondary)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderLeftColor = 'transparent';
            }
          }}
          onClick={() => handleNodeClick(node)}
        >
          <span style={{
            marginRight: 'var(--vf-space-2)',
            fontSize: 'var(--vf-text-xs)',
            opacity: 0.7
          }}>
            {node.is_directory ? (isExpanded ? '▼' : '▶') : '📄'}
          </span>
          <span style={{
            fontFamily: 'var(--vf-font-mono)',
            fontSize: 'var(--vf-text-sm)',
            letterSpacing: '0.02em'
          }}>
            {node.filename}
          </span>
        </div>
        {node.is_directory && isExpanded && node.children?.map(child =>
          renderNode(child, level + 1)
        )}
      </div>
    );
  }, [expandedDirs, selectedPath, handleNodeClick]);

  if (loading) {
    return (
      <div style={{
        height: '100%',
        width: '100%',
        background: 'var(--vf-bg-tertiary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--vf-space-4)'
      }}>
        <div style={{
          fontFamily: 'var(--vf-font-display)',
          fontSize: 'var(--vf-text-xs)',
          color: 'var(--vf-accent-primary)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em'
        }}>
          LOADING FILES...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      height: '100%',
      width: '100%',
      background: 'var(--vf-bg-tertiary)',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        borderBottom: '2px solid var(--vf-border-primary)',
        padding: 'var(--vf-space-2)',
        background: 'var(--vf-bg-secondary)'
      }}>
        <h3 style={{
          fontFamily: 'var(--vf-font-display)',
          fontSize: 'var(--vf-text-xs)',
          fontWeight: 'var(--vf-weight-bold)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--vf-text-primary)'
        }}>
          FILES
        </h3>
      </div>
      <div style={{ padding: 'var(--vf-space-1)' }}>
        {fileTree.map(node => renderNode(node))}
      </div>
    </div>
  );
}
