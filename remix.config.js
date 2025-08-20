/** @type {import('@remix-run/dev').AppConfig} */
export default {
  // Dejar que Remix use su valor predeterminado ('esm')
  // serverModuleFormat: 'esm', 
  serverBuildTarget: isProd ? 'cloudflare-pages' : 'node-cjs',
  ignoredRouteFiles: ['**/*.test.*'],
  future: {
    v3_fetcherPersist: true,
    v3_lazyRouteDiscovery: true,
    v3_relativeSplatPath: true,
    v3_singleFetch: true,
    v3_throwAbortReason: true,
  },
};