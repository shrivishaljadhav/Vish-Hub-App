import { proxyStudentAssessment } from './_student-assessments.js';

export async function onRequest(context) {
  if (context.request.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  return proxyStudentAssessment(context);
}
