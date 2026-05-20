import { useMutation } from '@tanstack/react-query';
import { api, FeedbackInput } from '@/lib/api';

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (data: FeedbackInput) => api.feedback.submit(data),
    onError: () => {
      // Silently fail — feedback is non-critical
    },
  });
}
