import { proxyStudentAssessment } from '../_student-assessments.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  return proxyStudentAssessment(context, '/submit');
}
