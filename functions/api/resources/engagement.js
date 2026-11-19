export async function onRequest(context) {
  const authorization = context.request.headers.get('Authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    return Response.json({ error: 'Sign in to record resource activity.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const upstream = context.env.STUDENT_RESOURCES_API_URL || 'https://us-central1-vish-hub.cloudfunctions.net/studentResourcesApi/api/resources/engagement';
  const response = await fetch(upstream, {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: await context.request.text(),
    redirect: 'manual'
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}
