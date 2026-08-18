import { NextResponse } from 'next/server';
import { checkAdminSecret } from '../../../../../lib/utils';
import { runBlogAgent } from '../../../../../lib/blogAgent';

// Fires the weekly blog agent on demand — writes a post, publishes it live,
// and posts the link plus tweet to Discord. Does not affect the schedule (the
// next Monday run still happens, subject to its own minimum-interval gate).
// Runs the full model call, so expect this to take a while to respond.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  try {
    const result = await runBlogAgent();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('Blog agent run failed:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
