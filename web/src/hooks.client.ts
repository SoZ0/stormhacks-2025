if (typeof window !== 'undefined' && typeof (window as { __TAURI__?: unknown }).__TAURI__ !== 'undefined') {
  import('$lib/tauri/api')
    .then(({ setupTauriApiInterceptor }) => {
      setupTauriApiInterceptor();
    })
    .catch((error) => {
      console.error('Failed to initialize Tauri API interceptor', error);
    });
}
