import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/chat': ['./brain/**'],
  },
}

export default nextConfig
