// Сквозная проверка 1.10: экзамен сектора. Проходит вживую в школе; платформа хранит список, дату и отметки.
// Админ готовит экзамен → CRM видит очередь и назначает бесплатный урок «exam» в свободное время (1.11)
// → урок доводит темы до 100 % (сектор не закрывается сам) → частичная сдача и пересдача → сдача, сектор закрыт, сертификат.
// RATE_CARD_ID — абонемент с расценкой для approve. После прогона QA-STUDENT-1 без открытого сектора: перезапустить qa-seed.
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


import { execFileSync } from 'node:child_process';
const INTEGRATION_SECRET = 'local-maestro-integration-secret';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(label, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `: ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}
const integration = (method, path, body) => http(`${APP_URL.replace('/api/v1', '/api/integration/v1')}${path}`, {
  method, body, headers: { Authorization: `Bearer ${INTEGRATION_SECRET}`, 'X-Integration-System': 'crm' },
});
const sql = (query) => execFileSync('psql', ['-h', 'localhost', '-U', 'vladislav', '-d', 'maestro_regression', '-At', '-c', query]).toString().trim();
const runId = Date.now().toString(36).toUpperCase();

const adminToken = await appLogin('qa_admin');
const teacherToken = await appLogin('qa_teacher_1');
await sleep(20000);
const studentToken = await appLogin('qa_student_1');
const parentToken = await appLogin('qa_parent_1');
const crmAdmin = await crmRequest(null, 'POST', '/api/auth/login', { phone: '+77000000001', password: PASSWORD });
const crmToken = crmAdmin.token ?? crmAdmin.data?.token;

// 1. Admin prepares the exam.
let board = (await appRequest(adminToken, 'GET', '/admin/sector-exams')).data;
let row = board.sectors.find((item) => item.crmStudentId === 'QA-STUDENT-1');
if (!row) throw new Error('У QA-STUDENT-1 нет открытого сектора: перезапустите qa-seed');
if (row.exam && ['draft', 'awaiting_schedule', 'scheduled'].includes(row.exam.status)) {
  await appRequest(adminToken, 'POST', `/admin/sector-exams/${row.exam.id}/cancel`, { reason: 'QA повтор' });
}
const template = (await appRequest(adminToken, 'GET', `/admin/sector-exams/template/${row.planId}`)).data;
const exam = (await appRequest(adminToken, 'POST', '/admin/sector-exams', {
  planId: row.planId, send: true,
  items: [...template.items, { kind: 'custom', title: 'Сыграть песню целиком', criteria: 'От начала до конца без остановок' }],
})).data;
check('админ подготовил экзамен из тем сектора и своего пункта', exam.status === 'awaiting_schedule' && exam.items.length === template.items.length + 1, `${exam.items.length} пунктов`);

// 2. CRM shows the queue; the admin books the exam as a free lesson in a free slot.
const crmQueue = await crmRequest(crmToken, 'GET', '/api/sector-exams/pending');
check('CRM видит экзамен в очереди', crmQueue.exams?.some((item) => item.examId === exam.id), `${crmQueue.count ?? 0} в очереди`);
// The QA teacher's day is busy; book the first free early slot in the past week (CRM refuses overlaps).
async function bookExam(examId) {
  for (let offset = 2; offset <= 9; offset += 1) {
    for (const [startTime, endTime] of [['08:00', '08:45'], ['08:45', '09:30']]) {
      const date = dateWithOffset(-offset);
      const result = await http(`${CRM_URL}/api/sector-exams/${examId}/schedule`, {
        method: 'POST', headers: { Authorization: `Bearer ${crmToken}` },
        body: { date, startTime, endTime, teacherId: 'QA-TEACHER-1', roomId: 'QA-ROOM-1' },
      });
      if (result.status === 201) return { ...result.json, date, startTime };
      if (result.json?.code !== 'CLASS_SCHEDULE_CONFLICT') throw new Error(`CRM schedule → ${result.status} ${JSON.stringify(result.json)}`);
    }
  }
  throw new Error('Нет свободного слота для экзамена');
}
const booking = await bookExam(exam.id);
const examClassId = booking.class.id;
const [bookedHours, bookedMinutes] = booking.startTime.split(':').map(Number);
const lessonAt = new Date(`${booking.date}T${String(bookedHours - 5).padStart(2, '0')}:${String(bookedMinutes).padStart(2, '0')}:00.000Z`).toISOString();
check('CRM создал бесплатный урок экзамена', booking.class.classType === 'exam' && booking.class.price === 0 && booking.platformConfirmed === true);
const examState = (await appRequest(adminToken, 'GET', '/admin/sector-exams')).data.sectors.find((item) => item.planId === row.planId)?.exam;
check('платформа получила урок и время', examState?.status === 'scheduled' && examState?.crmClassId === examClassId && examState?.scheduledAt === lessonAt,
  `${examState?.status} ${examState?.scheduledAt}`);

// 3. Not before every topic is at 100 %.
let teacherView = (await appRequest(teacherToken, 'GET', '/teachers/me/students/QA-STUDENT-1/sector-exams')).data;
let sector = teacherView.find((item) => item.planId === row.planId);
const early = await http(`${APP_URL}/teachers/me/sector-exams/${exam.id}/start`, { method: 'POST', body: {}, headers: { Authorization: `Bearer ${teacherToken}` } });
check('начать нельзя, пока темы не на 100 %', !sector.progress.ready && early.status === 409, `HTTP ${early.status} ${early.json?.code ?? early.json?.error?.code ?? ''}`);

// 4. A lesson brings every topic to 100 %; the sector stays open for the exam.
const lesson = await controller('POST', '/lessons', {
  scenarioId: `EXAMPREP-${runId}`, classType: 'individual', studentId: 'QA-STUDENT-1', teacherId: 'QA-TEACHER-1',
  date: dateWithOffset(-1), startTime: '16:00', endTime: '17:00', title: `Подготовка к экзамену ${runId}`,
});
const classId = lesson.data.class.crmClassId;
await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${classId}/start`, {});
await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${classId}/attendance`, {
  studentId: 'QA-STUDENT-1', attended: true, attendanceStatus: 'present', teacherNote: 'готов к экзамену',
  lessonPoints: 0, homeworkReview: { status: 'completed', completionPercent: 100 },
});
const roster = await appRequest(teacherToken, 'GET', `/teachers/me/offline-lessons/${classId}/students`);
const homeworkDecisions = findAll(roster, (o) => Array.isArray(o.pendingHomework) && o.crmStudentId === 'QA-STUDENT-1')
  .flatMap((s) => s.pendingHomework).map((item) => ({ recipientId: item.recipientId, cycleNumber: item.cycleNumber, decision: 'accepted' }));
const plan = findAll(roster, (o) => o.planId === row.planId && Array.isArray(o.topics))[0];
const topicUpdates = plan.topics.filter((topic) => topic.progressPercent < 100)
  .map((topic) => ({ topicId: topic.id, expectedPercent: topic.progressPercent, toPercent: 100 }));
check('в уроке нет обещания +250 за последнюю тему', plan.topics.every((topic) => !topic.planCompletionRewardPoints) && !plan.planCompletionRewardPoints);
await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${classId}/submit`, {
  topic: 'Подготовка к экзамену', lessonSummary: 'Все темы сектора освоены.', homeworkDraft: 'Повторить программу.',
  teacherOutcomeHint: 'held', learningResultsV2: { homeworkDecisions, topicUpdates },
});
await waitFor('CRM pending_admin_review', async () => {
  const card = await crmRequest(crmToken, 'GET', `/api/classes/${classId}`);
  return (card.data?.status ?? card.status ?? card.class?.status) === 'pending_admin_review' ? card : null;
});
const rateCardId = process.env.RATE_CARD_ID;
if (!rateCardId) throw new Error('Нужен RATE_CARD_ID');
await crmRequest(crmToken, 'POST', `/api/classes/${classId}/approve`, {
  billingDecisions: [{ studentId: 'QA-STUDENT-1', membershipId: rateCardId, attendanceStatus: 'present', amount: 4000 }],
  teacherComment: 'QA approve подготовки к экзамену',
});
await waitFor('platform report confirmed', async () => {
  const payload = await appRequest(adminToken, 'GET', `/admin/offline-lessons/${classId}/report-versions`);
  return findAll(payload, (o) => o.status === 'confirmed').length ? payload : null;
}, 40, 500);
teacherView = (await appRequest(teacherToken, 'GET', '/teachers/me/students/QA-STUDENT-1/sector-exams')).data;
sector = teacherView.find((item) => item.planId === row.planId);
check('все темы на 100 %, а сектор остаётся открытым до экзамена', sector?.progress.ready === true && sector?.canStart === true,
  `${sector?.progress.completed}/${sector?.progress.total}`);

// 5. First attempt: one point not done → retake.
let started = (await appRequest(teacherToken, 'POST', `/teachers/me/sector-exams/${exam.id}/start`, {})).data;
for (const [index, item] of started.items.entries()) {
  await appRequest(teacherToken, 'PUT', `/teachers/me/sector-exams/${exam.id}/items/${item.id}`, { done: index !== started.items.length - 1 });
}
const retake = (await appRequest(teacherToken, 'POST', `/teachers/me/sector-exams/${exam.id}/finish`, { decision: 'retake', comment: 'Песню доучить' })).data;
check('частичная сдача отправляет на пересдачу', retake.exam.outcome === 'partial' && Boolean(retake.retakeExamId));
const studentPlans = (await appRequest(studentToken, 'GET', '/students/me/monthly-plans?history=1')).data;
const studentSector = (studentPlans.plans ?? studentPlans).find((item) => item.id === row.planId);
check('ученик видит пересдачу в очереди, сектор открыт', studentSector?.status === 'active' && studentSector?.exam?.attempt === 2,
  `${studentSector?.status} попытка ${studentSector?.exam?.attempt}`);

// 6. Retake: CRM books it again, every point done → close the sector.
const retakeBooking = await bookExam(retake.retakeExamId);
check('пересдача назначена в CRM отдельным уроком', retakeBooking.class.title.includes('пересдача'), retakeBooking.class.title);
started = (await appRequest(teacherToken, 'POST', `/teachers/me/sector-exams/${retake.retakeExamId}/start`, {})).data;
for (const item of started.items) {
  await appRequest(teacherToken, 'PUT', `/teachers/me/sector-exams/${retake.retakeExamId}/items/${item.id}`, { done: true });
}
const closed = (await appRequest(teacherToken, 'POST', `/teachers/me/sector-exams/${retake.retakeExamId}/finish`, { decision: 'close_sector' })).data;
check('пересдача сдана, выдан сертификат', closed.exam.outcome === 'passed' && Boolean(closed.exam.certificate?.number), closed.exam.certificate?.number ?? '');
check('за закрытый сектор начислено 250', closed.awardedPoints === 250, `${closed.awardedPoints}`);
const ledger = sql(`select count(*) from points_transactions where source_key like 'learning-plan-completion:${row.planId}:%'`);
check('баллы за сектор начислены один раз', ledger === '1', ledger);

const after = (await appRequest(studentToken, 'GET', '/students/me/monthly-plans?history=1')).data;
const closedSector = (after.plans ?? after).find((item) => item.id === row.planId);
check('ученик видит закрытый сектор, отметки и сертификат', closedSector?.status === 'closed'
  && closedSector?.exam?.items?.every((item) => item.done === true) && Boolean(closedSector?.exam?.certificate));
const children = (await appRequest(parentToken, 'GET', '/parents/me/children')).data;
const child = (children.children ?? children).find?.((item) => item.crmStudentId === 'QA-STUDENT-1') ?? (children.children ?? children)[0];
const family = (await appRequest(parentToken, 'GET', `/parents/me/children/${child.id ?? child.studentId ?? child.userId}/monthly-plans`)).data;
check('родитель видит результат экзамена', family.recentExams?.some((item) => item.id === row.planId && item.exam?.certificate));
const notes = sql(`select count(*) from user_notifications n join users u on u.id = n.user_id where u.login = 'qa_student_1' and n.type = 'sector_exam_updated' and n.created_at > now() - interval '15 minutes'`);
check('ученику пришли уведомления об экзамене', Number(notes) >= 3, notes);

// 7. The exam lesson itself is reported and approved in CRM without any charge.
await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${examClassId}/start`, {});
await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${examClassId}/attendance`, {
  studentId: 'QA-STUDENT-1', attended: true, attendanceStatus: 'present', teacherNote: 'экзамен', lessonPoints: 0,
  homeworkReview: { status: 'completed', completionPercent: 100 },
});
await appRequest(teacherToken, 'POST', `/teachers/me/offline-lessons/${examClassId}/submit`, {
  topic: 'Экзамен сектора', lessonSummary: 'Экзамен проведён, отметки в платформе.', homeworkDraft: '',
  teacherOutcomeHint: 'held', learningResultsV2: { homeworkDecisions: [], topicUpdates: [] },
});
await waitFor('exam lesson on review', async () => {
  const card = await crmRequest(crmToken, 'GET', `/api/classes/${examClassId}`);
  return (card.data?.status ?? card.status ?? card.class?.status) === 'pending_admin_review' ? card : null;
});
const balanceBefore = sql(`select 1`) && Number(execFileSync('psql', ['-h', 'localhost', '-U', 'vladislav', '-d', 'maestro_crm_regression', '-At', '-c', `select "accountBalance" from "Student" where id = 'QA-STUDENT-1'`]).toString().trim());
const approvedExam = await http(`${CRM_URL}/api/classes/${examClassId}/approve`, {
  method: 'POST', headers: { Authorization: `Bearer ${crmToken}` },
  body: { topic: 'Экзамен сектора', lessonSummary: 'Экзамен проведён', billingDecisions: [{ studentId: 'QA-STUDENT-1', attendanceStatus: 'present' }] },
});
const balanceAfter = Number(execFileSync('psql', ['-h', 'localhost', '-U', 'vladislav', '-d', 'maestro_crm_regression', '-At', '-c', `select "accountBalance" from "Student" where id = 'QA-STUDENT-1'`]).toString().trim());
check('урок экзамена утверждён без списания', approvedExam.status === 200 && balanceAfter === balanceBefore, `HTTP ${approvedExam.status}, баланс ${balanceBefore} → ${balanceAfter}`);

console.log(`\nСектор ${row.planId} закрыт экзаменом. Чтобы вернуть QA-данные, перезапустите qa-seed.`);
