import type { SchoolOfflineLesson, StudentOfflineSummary } from "@/types/school-offline";

function escapeXml(str: unknown): string {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\r?\n/g, "&#10;");
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
}

function formatLessonDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return isoString;
  }
}

export function generateMonthlyReportXml(
  summary: StudentOfflineSummary,
  reportMonth: string,
): string {
  const studentName = summary.profile?.name || "Ученик";
  const groupNames = summary.profile?.groups?.map((g) => g.name).filter(Boolean).join(", ") || "Индивидуальное обучение";
  const monthName = monthLabel(reportMonth);

  const lessons = (summary.lessonHistory || []).filter(
    (lesson) => lesson.status === "completed" && lesson.date.slice(0, 7) === reportMonth,
  );

  const totalLessons = lessons.length;
  const totalPoints = lessons.reduce((sum, l) => sum + (Number(l.lessonPoints) || 0), 0);
  const planItems = summary.monthlyPlan?.items || [];
  const completedTopicsCount = planItems.filter((i) => i.status === "completed").length;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>Maestro School</Author>
  <Title>Отчёт об обучении - ${escapeXml(studentName)} - ${escapeXml(monthName)}</Title>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Top"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:CharSet="204" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="SchoolHeader">
   <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#1C1917"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="MetaLabel">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#6B7280"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="MetaValue">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#111827"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="KpiCard">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#92400E"/>
   <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/>
   </Borders>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
  </Style>
  <Style ss:ID="TableHeader">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1C1917" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#374151"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#374151"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#374151"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#374151"/>
   </Borders>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
  </Style>
  <Style ss:ID="DataCellRegular">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1F2937"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
   </Borders>
   <Alignment ss:Vertical="Top" ss:WrapText="1"/>
  </Style>
  <Style ss:ID="DataCellZebra">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#1F2937"/>
   <Interior ss:Color="#F9FAFB" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
   </Borders>
   <Alignment ss:Vertical="Top" ss:WrapText="1"/>
  </Style>
  <Style ss:ID="DataCellDate">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#1F2937"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
   </Borders>
   <Alignment ss:Horizontal="Center" ss:Vertical="Top" ss:WrapText="1"/>
  </Style>
  <Style ss:ID="DataCellPoints">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#047857"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
   </Borders>
   <Alignment ss:Horizontal="Center" ss:Vertical="Top"/>
  </Style>
  <Style ss:ID="DataCellTopic">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#0369A1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
   </Borders>
   <Alignment ss:Vertical="Top" ss:WrapText="1"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Отчёт за ${escapeXml(reportMonth)}">
  <Table ss:DefaultRowHeight="20">
   <!-- Generous explicit column widths to prevent cramped/truncated text -->
   <Column ss:AutoFitWidth="0" ss:Width="110"/>
   <Column ss:AutoFitWidth="0" ss:Width="140"/>
   <Column ss:AutoFitWidth="0" ss:Width="160"/>
   <Column ss:AutoFitWidth="0" ss:Width="200"/>
   <Column ss:AutoFitWidth="0" ss:Width="170"/>
   <Column ss:AutoFitWidth="0" ss:Width="240"/>
   <Column ss:AutoFitWidth="0" ss:Width="190"/>
   <Column ss:AutoFitWidth="0" ss:Width="240"/>
   <Column ss:AutoFitWidth="0" ss:Width="90"/>
   <Column ss:AutoFitWidth="0" ss:Width="200"/>

   <!-- Row 1: Brand Title -->
   <Row ss:Height="26">
    <Cell ss:MergeAcross="9" ss:StyleID="SchoolHeader">
     <Data ss:Type="String">🎵 Музыкальная школа Maestro — Отчёт об обучении</Data>
    </Cell>
   </Row>

   <!-- Row 2: Metadata -->
   <Row ss:Height="20">
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Ученик:</Data></Cell>
    <Cell ss:MergeAcross="2" ss:StyleID="MetaValue"><Data ss:Type="String">${escapeXml(studentName)}</Data></Cell>
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Период:</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="MetaValue"><Data ss:Type="String">${escapeXml(monthName)}</Data></Cell>
    <Cell ss:StyleID="MetaLabel"><Data ss:Type="String">Группа:</Data></Cell>
    <Cell ss:MergeAcross="1" ss:StyleID="MetaValue"><Data ss:Type="String">${escapeXml(groupNames)}</Data></Cell>
   </Row>

   <!-- Row 3: KPI Summary Cards -->
   <Row ss:Height="24">
    <Cell ss:MergeAcross="2" ss:StyleID="KpiCard">
     <Data ss:Type="String">📚 Проведено уроков: ${totalLessons}</Data>
    </Cell>
    <Cell ss:MergeAcross="3" ss:StyleID="KpiCard">
     <Data ss:Type="String">⭐ Набрано баллов: ${totalPoints} XP</Data>
    </Cell>
    <Cell ss:MergeAcross="3" ss:StyleID="KpiCard">
     <Data ss:Type="String">🎯 Темы плана: ${completedTopicsCount} из ${planItems.length} освоено</Data>
    </Cell>
   </Row>

   <!-- Empty row separator -->
   <Row ss:Height="12"/>

   <!-- Table Header Row -->
   <Row ss:Height="28">
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Дата</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Урок / Тип</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Преподаватель</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Тема занятия</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Цели</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Что сделали (итог)</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Что доработать</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Домашнее задание</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Баллы</Data></Cell>
    <Cell ss:StyleID="TableHeader"><Data ss:Type="String">Темы плана</Data></Cell>
   </Row>

   <!-- Data Rows -->
   ${lessons.length === 0 ? `
   <Row ss:Height="24">
    <Cell ss:MergeAcross="9" ss:StyleID="DataCellRegular">
     <Data ss:Type="String">За выбранный месяц (${escapeXml(monthName)}) проведённых уроков не найдено.</Data>
    </Cell>
   </Row>
   ` : lessons.map((lesson, index) => {
     const zebra = index % 2 === 1;
     const cellStyle = zebra ? "DataCellZebra" : "DataCellRegular";
     
     const planTopicsText = (lesson.planTopicResults && lesson.planTopicResults.length > 0)
       ? lesson.planTopicResults.map((item) => `${item.title} (${item.status === "completed" ? "освоено" : "в работе"})`).join(", ")
       : "";

     return `
   <Row ss:AutoFitHeight="1">
    <Cell ss:StyleID="DataCellDate"><Data ss:Type="String">${escapeXml(formatLessonDate(lesson.date))}</Data></Cell>
    <Cell ss:StyleID="${cellStyle}"><Data ss:Type="String">${escapeXml(lesson.title)}</Data></Cell>
    <Cell ss:StyleID="${cellStyle}"><Data ss:Type="String">${escapeXml(lesson.teacherName || "")}</Data></Cell>
    <Cell ss:StyleID="DataCellTopic"><Data ss:Type="String">${escapeXml(lesson.topic || "")}</Data></Cell>
    <Cell ss:StyleID="${cellStyle}"><Data ss:Type="String">${escapeXml(lesson.lessonGoals || "")}</Data></Cell>
    <Cell ss:StyleID="${cellStyle}"><Data ss:Type="String">${escapeXml(lesson.lessonSummary || "")}</Data></Cell>
    <Cell ss:StyleID="${cellStyle}"><Data ss:Type="String">${escapeXml(lesson.nextLessonFocus || "")}</Data></Cell>
    <Cell ss:StyleID="${cellStyle}"><Data ss:Type="String">${escapeXml(lesson.homework || "")}</Data></Cell>
    <Cell ss:StyleID="DataCellPoints"><Data ss:Type="Number">${Number(lesson.lessonPoints) || 0}</Data></Cell>
    <Cell ss:StyleID="${cellStyle}"><Data ss:Type="String">${escapeXml(planTopicsText)}</Data></Cell>
   </Row>`;
   }).join("")}

  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup>
    <Layout x:Orientation="Landscape"/>
    <Header x:Margin="0.3"/>
    <Footer x:Margin="0.3"/>
    <PageMargins x:Bottom="0.75" x:Left="0.7" x:Right="0.7" x:Top="0.75"/>
   </PageSetup>
   <Print>
    <ValidPrinterInfo/>
    <PaperSizeIndex>9</PaperSizeIndex> <!-- A4 -->
    <HorizontalResolution>600</HorizontalResolution>
    <VerticalResolution>600</VerticalResolution>
   </Print>
   <Selected/>
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>5</SplitHorizontal>
   <TopRowBottomPane>5</TopRowBottomPane>
   <ActivePane>2</ActivePane>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;

  return xml;
}

export function downloadMonthlyReportExcel(summary: StudentOfflineSummary, reportMonth: string) {
  const xml = generateMonthlyReportXml(summary, reportMonth);
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const link = document.createElement("a");
  const studentSlug = (summary.profile?.name || "student").toLowerCase().replace(/\s+/g, "_");
  link.href = URL.createObjectURL(blob);
  link.download = `maestro-report-${studentSlug}-${reportMonth}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
}

