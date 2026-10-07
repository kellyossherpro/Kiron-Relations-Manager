import { connection } from "next/server";
import { redirect } from "next/navigation";
import { hasAnyUsers } from "@/lib/session";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Set up" };

export default async function SetupPage() {
  await connection(); // always check the database at request time
  if (await hasAnyUsers()) redirect("/sign-in");
  return (
    <div className="space-y-4">
      <h1 className="h1">Set up KRM</h1>
      <p className="text-sm text-muted">KRM is empty. You&apos;ll be its first admin, and you can add everyone else afterwards.</p>
      <SetupForm />
    </div>
  );
}
