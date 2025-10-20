'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader2, Clock, AlertCircle } from 'lucide-react';

interface BuildEvent {
  type: string;
  phase?: string;
  message?: string;
  timestamp: Date;
  metadata?: any;
}

interface Build {
  id: string;
  status: 'pending' | 'building' | 'success' | 'failed';
  phase: 'pending' | 'setup' | 'install' | 'build' | 'test' | 'deploy' | 'complete' | 'failed';
  current_step?: string;
  total_steps?: number;
  duration_ms?: number;
  error_message?: string;
  install_logs?: string;
  build_logs?: string;
  live_output?: string;
  metadata?: any;
}

interface BuildStatusProps {
  buildId: string;
  projectId: string;
  onComplete?: () => void;
}

export function BuildStatus({ buildId, projectId, onComplete }: BuildStatusProps) {
  const [build, setBuild] = useState<Build | null>(null);
  const [events, setEvents] = useState<BuildEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    loadBuildStatus();

    // Poll for updates every 2 seconds
    const interval = setInterval(loadBuildStatus, 2000);

    return () => clearInterval(interval);
  }, [buildId]);

  const loadBuildStatus = async () => {
    try {
      const response = await fetch(`/api/workspace/build/${buildId}/details`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load build status');
      }

      const data = await response.json();
      setBuild(data.build);
      setLoading(false);

      // Load events
      const eventsResponse = await fetch(`/api/workspace/build/${buildId}/events?limit=50`);
      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        setEvents(eventsData.events || []);
      }

      // Call onComplete if build finished
      if (
        (data.build.status === 'success' || data.build.status === 'failed') &&
        onComplete
      ) {
        onComplete();
      }
    } catch (error) {
      console.error('Error loading build status:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-sm text-gray-600">Loading build status...</span>
      </div>
    );
  }

  if (!build) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-700">Build not found</p>
      </div>
    );
  }

  const getStatusIcon = () => {
    switch (build.status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'building':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'complete':
        return 'bg-green-100 text-green-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      case 'setup':
      case 'install':
      case 'build':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'In progress...';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {getStatusIcon()}
            <div>
              <h3 className="text-sm font-medium text-gray-900">
                Build #{buildId.substring(0, 8)}
              </h3>
              <p className="text-xs text-gray-500">
                {build.current_step || 'Initializing...'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPhaseColor(build.phase)}`}>
              {build.phase}
            </span>
            <span className="text-xs text-gray-500">
              {formatDuration(build.duration_ms)}
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {build.status === 'building' && build.total_steps && (
        <div className="px-4 py-3 bg-blue-50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-blue-900">Progress</span>
            <span className="text-xs text-blue-700">
              {Math.min(100, Math.floor((events.length / (build.total_steps * 2)) * 100))}%
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.floor((events.length / (build.total_steps * 2)) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {build.error_message && (
        <div className="p-4 bg-red-50 border-t border-red-200">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-900">Build Failed</p>
              <p className="text-xs text-red-700 mt-1 font-mono">{build.error_message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Build Events */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-gray-700 uppercase">Build Events</h4>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            {showLogs ? 'Hide' : 'Show'} Logs
          </button>
        </div>

        <div className="space-y-1 max-h-48 overflow-y-auto">
          {events.slice(-10).reverse().map((event, index) => (
            <div key={index} className="text-xs text-gray-600 py-1 px-2 hover:bg-gray-50 rounded">
              <span className="text-gray-400">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              {' '}
              <span className={`font-medium ${
                event.type === 'error' ? 'text-red-600' :
                event.type === 'warning' ? 'text-yellow-600' :
                'text-gray-700'
              }`}>
                [{event.type}]
              </span>
              {' '}
              {event.message}
            </div>
          ))}
        </div>
      </div>

      {/* Logs Section */}
      {showLogs && (
        <div className="border-t border-gray-200">
          {build.install_logs && (
            <div className="p-4 bg-gray-900">
              <h5 className="text-xs font-medium text-gray-300 mb-2">Install Logs</h5>
              <pre className="text-xs text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                {build.install_logs.substring(0, 2000)}
                {build.install_logs.length > 2000 && '\n... (truncated)'}
              </pre>
            </div>
          )}

          {build.build_logs && (
            <div className="p-4 bg-gray-900">
              <h5 className="text-xs font-medium text-gray-300 mb-2">Build Logs</h5>
              <pre className="text-xs text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                {build.build_logs.substring(0, 2000)}
                {build.build_logs.length > 2000 && '\n... (truncated)'}
              </pre>
            </div>
          )}

          {build.live_output && (
            <div className="p-4 bg-gray-900">
              <h5 className="text-xs font-medium text-gray-300 mb-2">Live Output</h5>
              <pre className="text-xs text-green-400 font-mono overflow-x-auto whitespace-pre-wrap">
                {build.live_output.substring(build.live_output.length - 2000)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
