export async function proxyStudentAssessment(context, suffix = '') {
  const authorization = context.request.headers.get('Authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    return Response.json({ error: 'Sign in with a verified student account to take assessments.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const upstream = (context.env.STUDENT_ASSESSMENTS_API_URL || 'https://us-central1-vish-hub.cloudfunctions.net/studentAssessmentsApi/api/assessments') + suffix;
  const headers = { Authorization: authorization };
  const init = { method: context.request.method, headers, redirect: 'manual' };
  if (context.request.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    init.body = await context.request.text();
  }
  const response = await fetch(upstream, init);
  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}
