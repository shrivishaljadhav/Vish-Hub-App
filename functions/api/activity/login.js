export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: { 'Cache-Control': 'no-store' } });
  }
  const authorization = context.request.headers.get('Authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    return Response.json({ error: 'Sign in to record student activity.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const upstream = context.env.STUDENT_ACTIVITY_API_URL
    || 'https://us-central1-vish-hub.cloudfunctions.net/studentActivityApi/api/activity/login';
  const response = await fetch(upstream, { method: 'POST', headers: { Authorization: authorization }, redirect: 'manual' });
  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}
