import { proxyStudentAssessment } from '../_student-assessments.js';

export async function onRequest(context) {
  if (context.request.method !== 'GET' || !/^[A-Za-z0-9_-]{1,160}$/.test(context.params.id || '')) {
    return Response.json({ error: 'Assessment not found.' }, { status: 404 });
  }
  return proxyStudentAssessment(context, `/${encodeURIComponent(context.params.id)}`);
}
