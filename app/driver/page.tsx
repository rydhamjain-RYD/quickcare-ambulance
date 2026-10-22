import { redirect } from "next/navigation";

// The route planner is the home page now. Keep old /driver links working.
export default function DriverRedirect() {
  redirect("/");
}
