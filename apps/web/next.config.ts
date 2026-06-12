import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Required for pnpm monorepos: tells Next.js to trace files from the repo
  // root so workspace package dependencies are included in serverless bundles.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: [
    '@appdeportes/types',
    '@appdeportes/utils',
    '@appdeportes/supabase',
    '@appdeportes/i18n',
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
