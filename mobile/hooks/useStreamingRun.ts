import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../lib/api';
import type { TaskRun, SSEOutputChunk, SSECompletionEvent } from '../lib/types';

interface UseStreamingRunOptions {
  taskId: number;
  runId: number;
  enabled?: boolean;
}

interface UseStreamingRunResult {
  output: string;
  status: TaskRun['status'];
  error: string | undefined;
  isStreaming: boolean;
  isComplete: boolean;
}

/**
 * Hook for subscribing to streaming output of a running task.
 * Handles SSE connection, accumulating output, and cleanup.
 */
export function useStreamingRun({
  taskId,
  runId,
  enabled = true,
}: UseStreamingRunOptions): UseStreamingRunResult {
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<TaskRun['status']>('running');
  const [error, setError] = useState<string | undefined>();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const streamRef = useRef<{ close: () => void } | null>(null);

  // Fetch initial run state
  useEffect(() => {
    if (!enabled || !taskId || !runId) return;

    const fetchInitialState = async () => {
      try {
        const run = await apiClient.getTaskRun(taskId, runId);
        setOutput(run.output || '');
        setStatus(run.status);
        if (run.error) setError(run.error);
        if (run.status === 'completed' || run.status === 'failed') {
          setIsComplete(true);
        }
      } catch (e) {
        console.error('Failed to fetch initial run state:', e);
      }
    };

    fetchInitialState();
  }, [taskId, runId, enabled]);

  // Subscribe to streaming updates
  useEffect(() => {
    if (!enabled || !taskId || !runId || isComplete) return;

    setIsStreaming(true);

    const subscription = apiClient.subscribeToRunStream(taskId, runId, {
      onOutput: (chunk: SSEOutputChunk) => {
        setOutput((prev) => prev + chunk.text);
        if (chunk.is_error) {
          setError((prev) => (prev ? prev + chunk.text : chunk.text));
        }
      },
      onComplete: (event: SSECompletionEvent) => {
        setStatus(event.status as TaskRun['status']);
        if (event.error) setError(event.error);
        setIsStreaming(false);
        setIsComplete(true);
      },
      onError: (err: Error) => {
        console.error('Stream error:', err);
        setError(err.message);
        setIsStreaming(false);
      },
    });

    streamRef.current = subscription;

    return () => {
      subscription.close();
      streamRef.current = null;
      setIsStreaming(false);
    };
  }, [taskId, runId, enabled, isComplete]);

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
