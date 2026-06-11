import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

type Source = 'bootstrap' | 'fixtures';

const isSource = (s: string | null): s is Source =>
  s === 'bootstrap' || s === 'fixtures';

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const source = url.searchParams.get('source');

  if (!isSource(source)) {
    return Response.json(
      { error: 'missing or invalid ?source= (expected bootstrap|fixtures)' },
      { status: 400 },
    );
  }

  // Real dispatch lands in Task 11. For now, signal not-yet-wired.
  return Response.json({ error: 'not implemented yet' }, { status: 501 });
}

if (import.meta.main) {
  Deno.serve(handler);
}
