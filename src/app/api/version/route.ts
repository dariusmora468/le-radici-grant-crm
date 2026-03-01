import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'local',
    commit_message: process.env.VERCEL_GIT_COMMIT_MESSAGE || 'unknown',
    deployed_at: process.env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN || 'unknown',
    build_time: BUILD_TIME,
    vercel_env: process.env.VERCEL_ENV || 'local',
    region: process.env.VERCEL_REGION || 'local',
    node: process.version,
  })
}

// This gets baked in at build time
const BUILD_TIME = new Date().toISOString()
