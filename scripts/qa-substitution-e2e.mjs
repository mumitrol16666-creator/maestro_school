// Сквозная проверка 1.9: замена по флагу.
// Фаза assign: урок QA-TEACHER-1 сегодня передаётся QA-TEACHER-2; замена видит ученика полностью, основной не ограничен.
// Фаза approve CLASS_ID=…: замена проводит урок, CRM утверждает, доступ замены закрывается.
// RATE_CARD_ID — чтобы не создавать тариф повторно.
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


const phase = process.argv[2] ?? 'assign';
const status = async (token, path) => (await http(`${APP_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })).status;
const workspace = (token) => http(`${APP_URL}/teachers/me/students/QA-STUDENT-1/workspace`, { headers: { Authorization: `Bearer ${token}` } });
const sectorPath = '/teachers/me/students/QA-STUDENT-1/monthly-plan?crmDirectionId=QA-DIRECTION-GUITAR';
function check(label, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `: ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

const regularToken = await appLogin('qa_teacher_1');
const substituteToken = await appLogin('qa_teacher_2');

if (phase === 'assign') {
  const before = await workspace(substituteToken);
  check('до назначения замена не видит ученика', before.status === 403, `HTTP ${before.status}`);
  // A unique title: CRM folds lessons with the same day, time, title and student into one.
  const runId = Date.now().toString(36).toUpperCase();
  const created = await controller('POST', '/lessons', {
    scenarioId: `SUB-${runId}`,
    classType: 'individual', studentId: 'QA-STUDENT-1', teacherId: 'QA-TEACHER-1',
    date: dateWithOffset(0), startTime: '08:00', endTime: '09:00', title: `Урок на замене ${runId}`,
  });
  const classId = created.data.class.crmClassId;
  await controller('PATCH', `/lessons/${classId}/substitute`, { teacherId: 'QA-TEACHER-2' });
  console.log('lesson', classId);

  const today = await appRequest(substituteToken, 'GET', '/teachers/me/today');
  const lesson = today.data.lessons.find((item) => item.crmClassId === classId);
  check('в «Сегодня» урок помечен как замена', lesson?.substitution === true);
  const during = await workspace(substituteToken);
  check('во время замены карточка открыта полностью', during.status === 200 && during.json.data.access.kind === 'substitute',
    `HTTP ${during.status} ${during.json?.data?.access?.kind ?? ''} вместо ${during.json?.data?.access?.originalTeacherName ?? '—'}`);
  check('история уроков видна', during.json?.data?.recentLessons?.available === true);
  check('сектор открыт замене', await status(substituteToken, sectorPath) === 200);
  const list = await appRequest(substituteToken, 'GET', '/teachers/me/students');
  const listed = (list.data.students ?? list.data).find?.((item) => item.crmStudentId === 'QA-STUDENT-1');
  check('в «Моих учениках» ученик с пометкой замены', Boolean(listed?.substitution));
  const studentUserId = during.json?.data?.student?.appUserId;
  const dialog = await http(`${APP_URL}/teachers/me/students/${studentUserId}/dialog`, {
    method: 'POST', body: { recipient: 'student' }, headers: { Authorization: `Bearer ${substituteToken}` },
  });
  check('замена может написать ученику', dialog.status < 300 && Boolean(dialog.json?.data?.conversationId), `HTTP ${dialog.status}`);
  const regular = await workspace(regularToken);
  check('основной преподаватель не ограничен', regular.json?.data?.access?.kind === 'assigned');
  console.log(`\nДальше: node scripts/qa-substitution-e2e.mjs approve ${classId}`);
} else {
  const classId = process.argv[3];
  if (!classId) throw new Error('Нужен CLASS_ID');
  const adminToken = await appLogin('qa_admin');
  const crmAdmin = await crmRequest(null, 'POST', '/api/auth/login', { phone: '+77000000001', password: PASSWORD });
  const crmToken = crmAdmin.token ?? crmAdmin.data?.token;

  const lessonState = await appRequest(substituteToken, 'GET', `/teachers/me/offline-lessons/${classId}`);
  const alreadySubmitted = ['pending_admin_review', 'pending_sync'].includes(lessonState.data?.status);
  if (!alreadySubmitted) {
  await appRequest(substituteToken, 'POST', `/teachers/me/offline-lessons/${classId}/start`, {});
  await appRequest(substituteToken, 'POST', `/teachers/me/offline-lessons/${classId}/attendance`, {
    studentId: 'QA-STUDENT-1', attended: true, attendanceStatus: 'present',
    teacherNote: 'провёл замену', lessonPoints: 0, homeworkReview: { status: 'completed', completionPercent: 100 },
  });
  const rosterPayload = await appRequest(substituteToken, 'GET', `/teachers/me/offline-lessons/${classId}/students`);
  const homeworkDecisions = findAll(rosterPayload, (o) => Array.isArray(o.pendingHomework) && o.crmStudentId === 'QA-STUDENT-1')
    .flatMap((s) => s.pendingHomework)
    .map((item) => ({ recipientId: item.recipientId, cycleNumber: item.cycleNumber, decision: 'accepted' }));
  await appRequest(substituteToken, 'POST', `/teachers/me/offline-lessons/${classId}/submit`, {
    topic: 'Замена', lessonSummary: 'Урок провёл преподаватель на замене.', homeworkDraft: 'Повторить.',
    teacherOutcomeHint: 'held', learningResultsV2: { homeworkDecisions, topicUpdates: [] },
  });
  }
  const pending = await workspace(substituteToken);
  check('после отправки отчёта и до утверждения доступ остаётся', pending.json?.data?.access?.kind === 'substitute', `HTTP ${pending.status}`);

  const rateCard = process.env.RATE_CARD_ID ? { membership: { id: process.env.RATE_CARD_ID } } : await crmRequest(crmToken, 'POST', '/api/memberships/rate-card', {
    studentId: 'QA-STUDENT-1', name: 'QA тариф', lessonRates: { individual: 4000 }, validFrom: '2026-01-01', validUntil: '2099-12-31',
    expectedActiveIds: await crmRequest(crmToken, 'GET', '/api/memberships?studentId=QA-STUDENT-1')
      .then((p) => findAll(p, (o) => o.status === 'active' && typeof o.id === 'string' && o.studentId === 'QA-STUDENT-1').map((m) => m.id)),
  });
  const rateCardId = rateCard.membership?.id ?? rateCard.data?.membership?.id ?? rateCard.data?.id;
  console.log('тариф:', rateCardId);
  await crmRequest(crmToken, 'POST', `/api/classes/${classId}/approve`, {
    billingDecisions: [{ studentId: 'QA-STUDENT-1', membershipId: rateCardId, attendanceStatus: 'present', amount: 4000 }],
    teacherComment: 'QA approve замены',
  });
  await waitFor('platform report confirmed', async () => {
    const payload = await appRequest(adminToken, 'GET', `/admin/offline-lessons/${classId}/report-versions`);
    return findAll(payload, (o) => o.status === 'confirmed').length ? payload : null;
  }, 40, 500);
  console.log('✓ урок утверждён в CRM, отчёт на платформе confirmed');

  const after = await workspace(substituteToken);
  check('после утверждения доступ замены закрыт', after.status === 403, `HTTP ${after.status}`);
  const sectorStatus = await status(substituteToken, sectorPath);
  check('сектор после утверждения закрыт', sectorStatus === 400 || sectorStatus === 403, `HTTP ${sectorStatus}`);
  const studentUserId = pending.json?.data?.student?.appUserId;
  const dialog = await waitFor('dialog closed', async () => {
    const result = await http(`${APP_URL}/teachers/me/students/${studentUserId}/dialog`, {
      method: 'POST', body: { recipient: 'student' }, headers: { Authorization: `Bearer ${substituteToken}` },
    });
    return result.status >= 400 ? result : null;
  }, 20, 500).catch(() => null);
  check('после утверждения переписка замены закрыта', Boolean(dialog), dialog ? `HTTP ${dialog.status}` : 'всё ещё открывается');
  const regular = await workspace(regularToken);
  check('основной преподаватель по-прежнему видит ученика', regular.json?.data?.access?.kind === 'assigned');
}
