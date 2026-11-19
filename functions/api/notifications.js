export async function onRequest(context) {
  const authorization = context.request.headers.get('Authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    return Response.json({ error: 'Sign in to load your notifications.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const suffix = context.request.method === 'POST' ? '/read' : '';
  const upstream = context.env.STUDENT_NOTIFICATIONS_API_URL
    || `https://us-central1-vish-hub.cloudfunctions.net/studentNotificationsApi/api/notifications${suffix}`;
  const response = await fetch(upstream, {
    method: context.request.method,
    headers: context.request.method === 'POST'
      ? { Authorization: authorization, 'Content-Type': 'application/json' }
      : { Authorization: authorization },
    ...(context.request.method === 'POST' ? { body: await context.request.text() } : {}),
    redirect: 'manual'
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}
