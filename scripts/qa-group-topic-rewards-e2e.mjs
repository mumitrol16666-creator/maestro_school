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
// ---------- 0.3: group topic Points only for present students ----------
const studentTokens = { 'QA-STUDENT-1': studentToken, 'QA-STUDENT-2': await appLogin('qa_student_2'), 'QA-STUDENT-3': await appLogin('qa_student_3') };
const pointsOf = async (token) => (await appRequest(token, 'GET', '/students/me/economy-profile')).data.points;
const pointsBefore = {};
for (const [id, token] of Object.entries(studentTokens)) pointsBefore[id] = await pointsOf(token);
console.log('Points до:', pointsBefore);

const created = await controller('POST', '/lessons', {
  scenarioId: `GRP-${suffix}`, classType: 'group', groupId: 'QA-GROUP-1', teacherId: 'QA-TEACHER-1',
  date: dateWithOffset(-1), startTime: '18:00', endTime: '19:30', title: 'Групповая тема: снимок посещаемости',
});
const classId = created.data.class.crmClassId;
console.log('lesson', classId);
await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${classId}/start`, {});
const attendance = { 'QA-STUDENT-1': 'present', 'QA-STUDENT-2': 'present', 'QA-STUDENT-3': 'unexcused_absence' };
for (const [studentId, status] of Object.entries(attendance)) {
  await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${classId}/attendance`, {
    studentId, attended: status === 'present', attendanceStatus: status, teacherNote: status,
    lessonPoints: 0, homeworkReview: { status: 'completed', completionPercent: 100 },
  });
}
const roster = await appRequest(teacherToken, 'GET', `/teachers/me/offline-lessons/${classId}/students`);
const groupTopic = findAll(roster, (o) => typeof o.id === 'string' && typeof o.progressPercent === 'number' && typeof o.title === 'string' && o.title.includes('ритм группы'))[0];
if (!groupTopic) throw new Error('group topic not found in lesson context');
console.log('групповая тема:', groupTopic.title, groupTopic.progressPercent + '%');
const decisions = findAll(roster, (o) => Array.isArray(o.pendingHomework) && typeof o.crmStudentId === 'string')
  .filter((s) => attendance[s.crmStudentId] === 'present')
  .flatMap((s) => s.pendingHomework.map((item) => ({ recipientId: item.recipientId, cycleNumber: item.cycleNumber, decision: 'accepted' })));
await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${classId}/submit`, {
  topic: 'Единый ритм группы', lessonSummary: 'Группа держит ритм.', homeworkDraft: 'Играть под метроном.', teacherOutcomeHint: 'held',
  learningResultsV2: { homeworkDecisions: decisions, topicUpdates: [{ topicId: groupTopic.id, expectedPercent: groupTopic.progressPercent, toPercent: 100 }] },
});
await waitFor('CRM pending_admin_review', async () => {
  const card = await crmRequest(crmToken, 'GET', `/api/classes/${classId}`);
  return (card.class?.status ?? card.data?.status) === 'pending_admin_review' ? card : null;
});
console.log('✓ групповой отчёт в CRM на подтверждении');

// rate cards for group billing (quartet-type group lessons use the "quartet" rate)
const billingDecisions = [];
for (const studentId of Object.keys(attendance)) {
  const active = JSON.parse(process.env.ACTIVE_IDS_JSON ?? "{}")[studentId] ?? [];
  const rc = await http(`${CRM_URL}/api/memberships/rate-card`, { method: 'POST', headers: { Authorization: `Bearer ${crmToken}` }, body: {
    studentId, name: 'QA групповой тариф', lessonRates: { individual: 4000, quartet: 2500, trio: 3000, duo: 3500, theory: 2000 },
    validFrom: '2026-01-01', validUntil: '2099-12-31', expectedActiveIds: active,
  } });
  let membershipId = rc.json?.membership?.id ?? rc.json?.data?.membership?.id;
  if (!membershipId) {
    const existing = await http(`${CRM_URL}/api/memberships?studentId=${studentId}`, { headers: { Authorization: `Bearer ${crmToken}` } })
      .then((r) => findAll(r.json, (o) => o.status === 'active' && o.billingModel === 'rate_card' && o.studentId === studentId)[0]);
    membershipId = existing?.id;
  }
  if (!membershipId) throw new Error(`no rate card for ${studentId}: ${JSON.stringify(rc.json).slice(0, 200)}`);
  billingDecisions.push({ studentId, membershipId, attendanceStatus: attendance[studentId], amount: attendance[studentId] === 'present' ? Number(process.env.GROUP_RATE ?? 2500) : 2500 });
}
const approved = await http(`${CRM_URL}/api/classes/${classId}/approve`, { method: 'POST', headers: { Authorization: `Bearer ${crmToken}` }, body: { billingDecisions, teacherComment: 'QA group approve' } });
console.log('approve:', approved.status, JSON.stringify(approved.json).slice(0, 200));
if (approved.status >= 400) process.exit(1);
await waitFor('platform confirmed', async () => {
  const payload = await appRequest(adminToken, 'GET', `/admin/offline-lessons/${classId}/report-versions`);
  return findAll(payload, (o) => typeof o.status === 'string').map((o) => o.status).includes('confirmed') ? payload : null;
}, 40, 500);
const pointsAfter = {};
for (const [id, token] of Object.entries(studentTokens)) pointsAfter[id] = await pointsOf(token);
console.log('Points после:', pointsAfter);
const delta = Object.fromEntries(Object.keys(pointsAfter).map((id) => [id, pointsAfter[id] - pointsBefore[id]]));
console.log('дельта:', delta);
if (delta['QA-STUDENT-3'] !== 0) throw new Error('absent student received Points');
if (delta['QA-STUDENT-1'] < 100 || delta['QA-STUDENT-2'] < 100) throw new Error('present students did not receive topic Points');
console.log('\nOK: сценарий 0.3 прошёл (Points только присутствовавшим)');
