export type TeacherAttendanceStatus =
  | "unmarked"
  | "present"
  | "late"
  | "unexcused_absence";

export function normalizeTeacherAttendanceStatus(
  attendanceStatus: string,
): TeacherAttendanceStatus {
  if (attendanceStatus === "present" || attendanceStatus === "late") {
    return attendanceStatus;
  }
  if (attendanceStatus === "unmarked") {
    return attendanceStatus;
  }
  // Respectful cancellations and emergency freezes are admin decisions.
  // Old cached teacher clients can still send those values, so convert them
  // to the factual teacher action: the student did not attend.
  return "unexcused_absence";
}
