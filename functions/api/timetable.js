export async function onRequest(context) {
  const authorization = context.request.headers.get('Authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    return Response.json({ error: 'Sign in to view the examination timetable.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const upstream = context.env.STUDENT_TIMETABLE_API_URL || 'https://us-central1-vish-hub.cloudfunctions.net/studentTimetableApi/api/timetable';
  const response = await fetch(upstream, { headers: { Authorization: authorization }, redirect: 'manual' });
  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}
