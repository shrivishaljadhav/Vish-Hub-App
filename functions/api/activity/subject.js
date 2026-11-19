export async function onRequest(context) {
  const authorization = context.request.headers.get('Authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    return Response.json({ error: 'A verified student account is required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  if (context.request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  const upstream = context.env.STUDENT_ACTIVITY_API_URL || 'https://us-central1-vish-hub.cloudfunctions.net/studentSubjectActivityApi/api/activity/subject';
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
