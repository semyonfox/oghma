/**
 * SWR-optimized Tree fetching hook
 * 
 * Provides efficient tree data fetching with:
 * - Cached tree structure
 * - Pagination support (skip/limit)
 * - Field selection for minimal payloads
 * - Background revalidation
 * 
 * Usage:
 *   const { data: tree, isLoading } = useTreeSWR({ limit: 50 });
 */

import { useCallback } from 'react';
import { TreeModel } from '@/lib/notes/types/tree';
import { useSWR } from './use-swr';
import { APIUrl } from '@/lib/notes/api/query-builder';
import useFetcher from '@/lib/notes/api/fetcher';

interface UseTreeSWROptions {
  // Pagination: number of items to skip
  skip?: number;
  // Pagination: max items to fetch
  limit?: number;
  // Only fetch specific fields
  fields?: string[];
  // Cache duration (default: 5 minutes)
  cacheDuration?: number;
  // Auto-revalidate interval
  revalidateInterval?: number;
  // Revalidate on focus (enabled by default)
  revalidateOnFocus?: boolean;
}

/**
 * Fetch tree structure with SWR
 */
export function useTreeSWR(options: UseTreeSWROptions = {}) {
  const { request } = useFetcher();
  const {
    skip = 0,
    limit,
    fields,
    cacheDuration = 5 * 60 * 1000, // 5 minutes
    revalidateInterval = 0,
    revalidateOnFocus = true,
  } = options;

  // Build URL with query parameters
  const builder = new APIUrl('', '/api/tree');
  if (fields && fields.length > 0) {
    builder.fields(...fields);
  }
  if (skip > 0 || limit) {
    builder.paginate(skip, limit || 100);
  }
  const url = builder.toPath();

  const fetcher = useCallback(async (): Promise<TreeModel | undefined> => {
    try {
      return await request<null, TreeModel>({
        method: 'GET',
        url,
      });
    } catch (error) {
      console.error('Failed to fetch tree:', error);
      throw error;
    }
  }, [url, request]);

  return useSWR<TreeModel | undefined>(
    url,
    fetcher,
    {
      cacheDuration,
      revalidateInterval,
      revalidateOnFocus,
    }
  );
}
