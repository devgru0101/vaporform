import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string; path?: string[] }> }
) {
  try {
    console.log('[Preview Proxy] Request received');

    const { userId, getToken } = await auth();

    if (!userId) {
      console.log('[Preview Proxy] Unauthorized - no user ID');
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const params = await context.params;
    const { workspaceId, path } = params;
    const proxyPath = path ? path.join('/') : '';

    console.log(`[Preview Proxy] WorkspaceId: ${workspaceId}, Path: ${proxyPath}`);

    // Get Clerk session token for backend auth
    const token = await getToken();
    if (!token) {
      console.log('[Preview Proxy] Unauthorized - no token');
      return new NextResponse('Unauthorized - no token', { status: 401 });
    }

    // Get preview URL and token from backend
    console.log(`[Preview Proxy] Fetching preview info from: ${API_URL}/workspace/${workspaceId}/url`);
    const previewResponse = await fetch(`${API_URL}/workspace/${workspaceId}/url`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!previewResponse.ok) {
      console.error(`[Preview Proxy] Failed to get preview URL: ${previewResponse.status}`);
      const errorText = await previewResponse.text().catch(() => 'Unknown error');
      console.error(`[Preview Proxy] Error details: ${errorText}`);
      return new NextResponse(`Preview not available: ${errorText}`, { status: 503 });
    }

    const previewData = await previewResponse.json();
    console.log(`[Preview Proxy] Got preview data:`, {
      hasUrl: !!previewData.url,
      hasToken: !!previewData.token,
      url: previewData.url
    });

    if (!previewData.url) {
      console.error('[Preview Proxy] No preview URL available - workspace may not be running');
      return new NextResponse('Preview not available - workspace may not be running or no dev server detected', { status: 503 });
    }

    if (!previewData.token) {
      console.warn('[Preview Proxy] No auth token provided - continuing without token');
    }

    // Construct target URL - ensure proper path joining
    let targetUrl = previewData.url;
    // Remove trailing slash from base URL
    if (targetUrl.endsWith('/')) {
      targetUrl = targetUrl.slice(0, -1);
    }
    // Add proxy path if present
    if (proxyPath) {
      targetUrl = `${targetUrl}/${proxyPath}`;
    }

    const queryParams = request.nextUrl.searchParams.toString();
    const fullTargetUrl = queryParams ? `${targetUrl}?${queryParams}` : targetUrl;

    console.log(`[Preview Proxy] Fetching from Daytona: ${fullTargetUrl}`);

    // Build headers - only add token if available
    const headers: Record<string, string> = {
      'X-Daytona-Skip-Preview-Warning': 'true',
      'User-Agent': request.headers.get('user-agent') || 'Vaporform-Preview-Proxy',
      'Accept': request.headers.get('accept') || '*/*',
      'Accept-Language': request.headers.get('accept-language') || 'en-US,en;q=0.9',
    };

    if (previewData.token) {
      headers['x-daytona-preview-token'] = previewData.token;
    }

    // Fetch from Daytona with authentication
    const daytonaResponse = await fetch(fullTargetUrl, { headers });

    if (!daytonaResponse.ok) {
      console.error(`[Preview Proxy] Daytona returned ${daytonaResponse.status}: ${daytonaResponse.statusText}`);
      const errorText = await daytonaResponse.text();
      console.error(`[Preview Proxy] Error body: ${errorText.substring(0, 200)}`);
      return new NextResponse(`Daytona error: ${daytonaResponse.statusText}`, {
        status: daytonaResponse.status
      });
    }

    // Get response body and headers
    const contentType = daytonaResponse.headers.get('content-type') || 'text/html';
    const body = await daytonaResponse.arrayBuffer();

    console.log(`[Preview Proxy] Successfully proxied response (${body.byteLength} bytes, ${contentType})`);

    // Return proxied response
    return new NextResponse(body, {
      status: daytonaResponse.status,
      headers: {
        'Content-Type': contentType,
        // Allow embedding in iframe from same origin
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "frame-ancestors 'self'",
      }
    });

  } catch (error) {
    console.error('[Preview Proxy] Error:', error);
    return new NextResponse(
      `Proxy error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { status: 500 }
    );
  }
}
