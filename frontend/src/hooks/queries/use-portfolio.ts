import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  PortfolioListResponse,
  HoldingInput,
  InvestmentProfileView,
  InvestmentProfileInput,
} from '@/lib/api';
import { queryKeys } from './query-keys';

export function usePortfolio(userId?: string) {
  return useQuery({
    queryKey: queryKeys.portfolio.byUser(userId || ''),
    queryFn: () => api.portfolio.get(),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useSavePortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rows }: { userId: string; rows: HoldingInput[] }) =>
      api.portfolio.bulkSave(rows),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(
        queryKeys.portfolio.byUser(vars.userId),
        data,
      );
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.byUser(vars.userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.digests.all });
    },
  });
}

export function useDeleteHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ symbol }: { userId: string; symbol: string }) =>
      api.portfolio.delete(symbol),
    onMutate: async ({ userId, symbol }) => {
      const key = queryKeys.portfolio.byUser(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PortfolioListResponse>(key);
      if (previous) {
        queryClient.setQueryData<PortfolioListResponse>(key, {
          ...previous,
          holdings: previous.holdings.filter((h) => h.symbol !== symbol),
        });
      }
      return { previous, key };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined && context.key) {
        queryClient.setQueryData(context.key, context.previous);
      }
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.byUser(vars.userId) });
    },
  });
}

export function useTouchPortfolio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.portfolio.touch(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentProfile.all });
    },
  });
}

export function useInvestmentProfile(userId?: string) {
  return useQuery({
    queryKey: queryKeys.investmentProfile.byUser(userId || ''),
    queryFn: () => api.investmentProfile.get(),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useSaveInvestmentProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data }: { userId: string; data: InvestmentProfileInput }) =>
      api.investmentProfile.save(data),
    onSuccess: (data, vars) => {
      queryClient.setQueryData<InvestmentProfileView>(
        queryKeys.investmentProfile.byUser(vars.userId),
        data,
      );
    },
    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentProfile.byUser(vars.userId) });
    },
  });
}
