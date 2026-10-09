import { redirect } from "next/navigation";
import { connection } from "next/server";
import { GateForm } from "./gate-form";

export const metadata = { title: "Test version" };

export default async function GatePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await connection(); // decide at request time: the password is only known when the site runs
  if (!process.env.SITE_PASSWORD) redirect("/");
  const { next } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="h1">Test version</h1>
      <p className="text-sm text-muted">This is a test copy of KRM filled with made-up example data. Enter the password you were given.</p>
      <GateForm next={next ?? "/"} />
    </div>
  );
}
