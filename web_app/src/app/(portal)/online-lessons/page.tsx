import { redirect } from "next/navigation";

export default function OnlineLessonsCompatibilityPage() {
  redirect("/school-lessons?tab=schedule&format=online");
}
