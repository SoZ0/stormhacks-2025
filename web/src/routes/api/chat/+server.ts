import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleChatRequest, HttpError } from '$lib/api/chat';

export const POST: RequestHandler = async ({ request, cookies }) => {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    return await handleChatRequest(payload, cookies);
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.message }, { status: error.status });
    }
    console.error('Chat endpoint error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
