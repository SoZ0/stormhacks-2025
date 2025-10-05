import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  deleteModel,
  getModelById,
  updateModel,
  type UpdateModelInput
} from '$lib/server/live2d/store';

export const GET: RequestHandler = async ({ params }) => {
  const model = await getModelById(params.id);
  if (!model) {
    return json({ error: 'Model not found' }, { status: 404 });
  }

  return json({ model });
};

export const PATCH: RequestHandler = async ({ request, params }) => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const model = await updateModel(params.id, body as UpdateModelInput);
    return json({ model });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update model';
    return json({ error: message }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await deleteModel(params.id);
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete model';
    return json({ error: message }, { status: 400 });
  }
};
