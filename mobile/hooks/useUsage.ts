import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';

export function useUsage() {
  return useQuery({
    queryKey: ['usage'],
    queryFn: () => apiClient.getUsage(),
    refetchInterval: 30000,
  });
}
