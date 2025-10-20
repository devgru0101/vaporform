'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';

interface BuildIndicatorProps {
  projectId: string;
  compact?: boolean;
  onBuildClick?: () => void;
}

export function BuildIndicator({ projectId, compact = false, onBuildClick }: BuildIndicatorProps) {
  const [latestBuild, setLatestBuild] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLatestBuild();

    // Poll every 3 seconds
    const interval = setInterval(loadLatestBuild, 3000);

    return () => clearInterval(interval);
  }, [projectId]);

  const loadLatestBuild = async () => {
    try {
      const response = await fetch(`/api/workspace/builds/${projectId}/detailed?limit=1`);

      if (!response.ok) {
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (data.builds && data.builds.length > 0) {
        setLatestBuild(data.builds[0]);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading latest build:', error);
      setLoading(false);
    }
  };

  if (loading || !latestBuild) {
    return null;
  }

  const getBuildStatus = () => {
    switch (latestBuild.status) {
      case 'success':
        return {
          icon: <CheckCircle className="h-4 w-4" />,
          color: 'text-green-600',
          bg: 'bg-green-50',
          border: 'border-green-200',
          label: 'Build Successful',
        };
      case 'failed':
        return {
          icon: <XCircle className="h-4 w-4" />,
          color: 'text-red-600',
          bg: 'bg-red-50',
          border: 'border-red-200',
          label: 'Build Failed',
        };
      case 'building':
        return {
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          color: 'text-blue-600',
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          label: `Building: ${latestBuild.phase}`,
        };
      default:
        return {
          icon: <AlertTriangle className="h-4 w-4" />,
          color: 'text-gray-600',
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          label: 'Build Pending',
        };
    }
  };

  const status = getBuildStatus();

  if (compact) {
    return (
      <button
        onClick={onBuildClick}
        className={`flex items-center space-x-2 px-3 py-1.5 rounded-md ${status.bg} ${status.border} border hover:opacity-80 transition-opacity`}
        title={status.label}
      >
        <div className={status.color}>{status.icon}</div>
        <span className={`text-xs font-medium ${status.color}`}>
          {latestBuild.status === 'building' ? latestBuild.phase : latestBuild.status}
        </span>
      </button>
    );
  }

  return (
    <div
      className={`flex items-start space-x-3 p-3 rounded-lg ${status.bg} ${status.border} border cursor-pointer hover:opacity-80 transition-opacity`}
      onClick={onBuildClick}
    >
      <div className={status.color}>{status.icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${status.color}`}>{status.label}</p>
        {latestBuild.current_step && (
          <p className="text-xs text-gray-600 mt-1 truncate">{latestBuild.current_step}</p>
        )}
        {latestBuild.error_message && (
          <p className="text-xs text-red-600 mt-1 truncate">{latestBuild.error_message}</p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          Build #{latestBuild.id.toString().substring(0, 8)}
          {latestBuild.duration_ms && (
            <span className="ml-2">
              • {Math.floor(latestBuild.duration_ms / 1000)}s
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
