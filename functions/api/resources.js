export async function onRequest(context) {
  const authorization = context.request.headers.get('Authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    return Response.json({ error: 'Sign in to load published resources.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const requestUrl = new URL(context.request.url);
  const collection = requestUrl.searchParams.get('collection');
  const query = collection ? `?collection=${encodeURIComponent(collection)}` : '';
  const upstream = (context.env.STUDENT_RESOURCES_API_URL || 'https://us-central1-vish-hub.cloudfunctions.net/studentResourcesApi/api/resources') + query;
  const response = await fetch(upstream, { headers: { Authorization: authorization }, redirect: 'manual' });
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}
