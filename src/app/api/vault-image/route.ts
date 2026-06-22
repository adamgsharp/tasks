import { NextRequest, NextResponse } from 'next/server'
import { getFileBase64 } from '@/lib/github'

export const runtime = 'nodejs'

function mimeType(filePath: string) {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'jpg'
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path')
  if (!filePath) return new NextResponse('Missing path', { status: 400 })

  try {
    const b64 = await getFileBase64(filePath)
    if (!b64) return new NextResponse('Not found', { status: 404 })
    const buffer = Buffer.from(b64, 'base64')
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType(filePath),
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return new NextResponse('Error fetching image', { status: 500 })
  }
}
