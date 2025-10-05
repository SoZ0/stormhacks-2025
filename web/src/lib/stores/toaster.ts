import { createToaster } from '@skeletonlabs/skeleton-svelte';

export const toaster = createToaster({
  placement: 'bottom-end',
  duration: 6000,
  gap: 12
});
