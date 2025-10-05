import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createModel, listModels } from '$lib/server/live2d/store';

export const GET: RequestHandler = async () => {
  const models = await listModels();
  return json({ models });
};

export const POST: RequestHandler = async ({ request }) => {
  const formData = await request.formData();
  const file = formData.get('file');
  const label = formData.get('label');

  if (!(file instanceof File)) {
    return json({ error: 'file is required' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const model = await createModel({
      zipBuffer: buffer,
      filename: file.name,
      label: typeof label === 'string' ? label : undefined
    });
    return json({ model }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create model';
    return json({ error: message }, { status: 400 });
  }
};
