import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../lib/api';
import type { TaskRun } from '../lib/types';

interface UseStreamingRunOptions {
  taskId: number;
  runId: number;
  enabled?: boolean;
  pollInterval?: number; // Polling interval in ms (default: 500)
}

interface UseStreamingRunResult {
  output: string;
  status: TaskRun['status'];
  error: string | undefined;
  isStreaming: boolean;
  isComplete: boolean;
}

/**
 * Hook for polling output of a running task.
 * Uses polling since React Native doesn't support ReadableStream.
 */
export function useStreamingRun({
  taskId,
  runId,
  enabled = true,
  pollInterval = 500,
}: UseStreamingRunOptions): UseStreamingRunResult {
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<TaskRun['status']>('running');
  const [error, setError] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for run state updates
  useEffect(() => {
    if (!enabled || !taskId || !runId) return;

    const fetchRunState = async () => {
      try {
        const run = await apiClient.getTaskRun(taskId, runId);
        setOutput(run.output || '');
        setStatus(run.status);
        if (run.error) setError(run.error);

        if (run.status === 'completed' || run.status === 'failed') {
          setIsComplete(true);
          setIsStreaming(false);
          // Stop polling
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (e) {
        console.error('Failed to fetch run state:', e);
      }
    };

    // Initial fetch
    fetchRunState();

    // Start polling if not complete
    if (!isComplete) {
      setIsStreaming(true);
      intervalRef.current = setInterval(fetchRunState, pollInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setIsStreaming(false);
    };
  }, [taskId, runId, enabled, pollInterval, isComplete]);

  return {
    output,
    status,
    error,
    isStreaming,
    isComplete,
  };
}

/**
 * Hook for running a task with streaming and getting real-time output.
 */
export function useRunTaskStreaming(taskId: number) {
  const [runId, setRunId] = useState<number | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | undefined>();

  const startRun = useCallback(async () => {
    if (!taskId) return null;

    setIsStarting(true);
    setStartError(undefined);
    setRunId(null);

    try {
      const response = await apiClient.runTaskStreaming(taskId);
      setRunId(response.run_id);
      return response.run_id;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to start task';
      setStartError(errorMessage);
      return null;
    } finally {
      setIsStarting(false);
    }
  }, [taskId]);

  const streamResult = useStreamingRun({
    taskId,
    runId: runId || 0,
    enabled: runId !== null,
  });

  return {
    startRun,
    runId,
    isStarting,
    startError,
    ...streamResult,
  };
}
