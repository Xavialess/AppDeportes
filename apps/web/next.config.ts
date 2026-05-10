import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@appdeportes/types',
    '@appdeportes/utils',
    '@appdeportes/supabase',
    '@appdeportes/i18n',
  ],
};

export default nextConfig;
