// Сквозная проверка 0.1: approve в CRM UI-маршруте → колбэк на платформу → уведомления ученику и родителю.
const CRM_URL = 'http://127.0.0.1:5002';
const APP_URL = 'http://127.0.0.1:4001/api/v1';
const QA_SECRET = 'local-maestro-qa-controller-2026';
const PASSWORD = 'QaMaestro2026!';

async function http(url, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: response.status, json };
}
const appRequest = async (token, method, path, body) => {
  const result = await http(`${APP_URL}${path}`, { method, body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (result.status >= 400) throw new Error(`APP ${method} ${path} → ${result.status} ${JSON.stringify(result.json)}`);
  return result.json;
};
const crmRequest = async (token, method, path, body) => {
  const result = await http(`${CRM_URL}${path}`, { method, body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (result.status >= 400) throw new Error(`CRM ${method} ${path} → ${result.status} ${JSON.stringify(result.json)}`);
  return result.json;
};
const controller = (method, path, body) => http(`${CRM_URL}/api/qa/v1${path}`, {
  method, body, headers: { 'X-Maestro-QA-Secret': QA_SECRET },
}).then((r) => { if (r.status >= 400) throw new Error(`QA ${path} → ${r.status} ${JSON.stringify(r.json)}`); return r.json; });

async function appLogin(login) {
  const payload = await appRequest(null, 'POST', '/auth/login', { phone: login, password: PASSWORD });
  return payload.data.token;
}
async function waitFor(label, probe, attempts = 30, delayMs = 1000) {
  for (let i = 0; i < attempts; i += 1) {
    const value = await probe();
    if (value) return value;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Timeout: ${label}`);
}
function dateWithOffset(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function findAll(value, predicate, out = []) {
  if (Array.isArray(value)) value.forEach((v) => findAll(v, predicate, out));
  else if (value && typeof value === 'object') {
    if (predicate(value)) out.push(value);
    Object.values(value).forEach((v) => findAll(v, predicate, out));
  }
  return out;
}

const suffix = Date.now().toString(36).toUpperCase();
const teacherToken = await appLogin('qa_teacher_1');
const studentToken = await appLogin('qa_student_1');
const parentToken = await appLogin('qa_parent_1');
const adminToken = await appLogin('qa_admin');
const crmAdmin = await crmRequest(null, 'POST', '/api/auth/login', { phone: '+77000000001', password: PASSWORD });
const crmToken = crmAdmin.token ?? crmAdmin.data?.token;
if (!crmToken) throw new Error(`CRM login: ${JSON.stringify(crmAdmin).slice(0, 200)}`);

const listOf = (payload) => (Array.isArray(payload.data) ? payload.data : payload.data?.items ?? []);
const before = {
  student: listOf(await appRequest(studentToken, 'GET', '/students/me/notifications?limit=50')),
  parent: listOf(await appRequest(parentToken, 'GET', '/students/me/notifications?limit=50')),
};

const created = await controller('POST', '/lessons', {
  scenarioId: `CB-${suffix}`,
  classType: 'individual',
  studentId: 'QA-STUDENT-1',
  teacherId: 'QA-TEACHER-1',
  date: dateWithOffset(-1),
  startTime: '10:00',
  endTime: '11:00',
  title: 'Проверка колбэка approve',
});
const classId = created.data.class.crmClassId;
console.log('lesson', classId);

await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${classId}/start`, {});
await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${classId}/attendance`, {
  studentId: 'QA-STUDENT-1', attended: true, attendanceStatus: 'present',
  teacherNote: 'присутствовал', lessonPoints: 0, homeworkReview: { status: 'completed', completionPercent: 100 },
});
const rosterPayload = await appRequest(teacherToken, 'GET', `/teachers/me/offline-lessons/${classId}/students`);
const pending = findAll(rosterPayload, (o) => Array.isArray(o.pendingHomework) && typeof o.crmStudentId === 'string')
  .filter((s) => s.crmStudentId === 'QA-STUDENT-1')
  .flatMap((s) => s.pendingHomework);
const homeworkDecisions = pending.map((item) => ({ recipientId: item.recipientId, cycleNumber: item.cycleNumber, decision: 'accepted' }));
console.log('ожидающих ДЗ v2 у ученика:', homeworkDecisions.length);

await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${classId}/submit`, {
  topic: 'Тема для проверки колбэка',
  lessonSummary: 'Ученик сыграл упражнение.',
  homeworkDraft: 'Повторить упражнение.',
  teacherOutcomeHint: 'held',
  learningResultsV2: { homeworkDecisions, topicUpdates: [] },
});
await waitFor('CRM pending_admin_review', async () => {
  const card = await crmRequest(crmToken, 'GET', `/api/classes/${classId}`);
  const status = card.data?.status ?? card.status ?? card.class?.status;
  return status === 'pending_admin_review' ? card : null;
});
console.log('✓ отчёт в CRM на подтверждении');

const rateCard = process.env.RATE_CARD_ID ? { membership: { id: process.env.RATE_CARD_ID } } : await crmRequest(crmToken, 'POST', '/api/memberships/rate-card', {
  studentId: 'QA-STUDENT-1', name: 'QA тариф', lessonRates: { individual: 4000 }, validFrom: '2026-01-01', validUntil: '2099-12-31',
  expectedActiveIds: (await crmRequest(crmToken, 'GET', '/api/memberships?studentId=QA-STUDENT-1').then((p) => findAll(p, (o) => o.status === 'active' && typeof o.id === 'string' && o.studentId === 'QA-STUDENT-1').map((m) => m.id)).catch(() => ['QA-MEMBERSHIP-GROUP-1', 'QA-MEMBERSHIP-IND-1'])),
});
const rateCardId = rateCard.membership?.id ?? rateCard.data?.membership?.id ?? rateCard.data?.id;
console.log('тариф с расценкой:', rateCardId);
const approveStartedAt = Date.now();
const approved = await crmRequest(crmToken, 'POST', `/api/classes/${classId}/approve`, {
  billingDecisions: [{ studentId: 'QA-STUDENT-1', membershipId: rateCardId, attendanceStatus: 'present', amount: 4000 }],
  teacherComment: 'QA approve',
});
console.log('✓ approve в CRM:', approved.success ?? approved.data?.status ?? 'ok');

await waitFor('platform report confirmed', async () => {
  const payload = await appRequest(adminToken, 'GET', `/admin/offline-lessons/${classId}/report-versions`);
  const statuses = findAll(payload, (o) => typeof o.status === 'string').map((o) => o.status);
  return statuses.includes('confirmed') ? payload : null;
}, 40, 500);
console.log(`✓ отчёт на платформе confirmed через ${Date.now() - approveStartedAt} мс`);

const newNotifications = async (token, previous) => {
  const list = listOf(await appRequest(token, 'GET', '/students/me/notifications?limit=50'));
  const prev = new Set(previous.map((n) => n.id));
  return list.filter((n) => !prev.has(n.id));
};
const studentNew = await waitFor('student notification', async () => {
  const list = await newNotifications(studentToken, before.student);
  return list.some((n) => n.type === 'offline_lesson_report_ready') ? list : null;
}, 30, 500);
console.log('✓ ученику пришло:', studentNew.map((n) => `${n.type}: ${n.title}`));
const parentNew = await waitFor('parent notification', async () => {
  const list = await newNotifications(parentToken, before.parent);
  return list.length ? list : null;
}, 30, 500);
console.log('✓ родителю пришло:', parentNew.map((n) => `${n.type}: ${n.title}`));

const logs = await http(`${CRM_URL}/api/integration-logs?limit=10`, { headers: { Authorization: `Bearer ${crmToken}` } });
const entries = findAll(logs.json, (o) => typeof o.operation === 'string');
const callback = entries.find((e) => e.operation.includes('offline-lesson-approved'));
console.log('колбэк в журнале CRM:', callback ? JSON.stringify({ operation: callback.operation, status: callback.status, httpStatus: callback.httpStatus ?? callback.responseStatus }) : `не найден (${entries.length} записей, HTTP ${logs.status})`);
console.log('\nOK: сквозной сценарий 0.1 прошёл');
