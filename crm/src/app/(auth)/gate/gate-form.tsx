"use client";

import { useActionState } from "react";
import { enterSiteAction } from "@/app/actions";

export function GateForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(enterSiteAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="site-password">Password</label>
        <input id="site-password" name="password" type="password" className="input" autoComplete="current-password" required autoFocus />
      </div>
      {state && !state.ok && <p className="text-sm text-danger" role="alert">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Checking…" : "Continue"}</button>
    </form>
  );
}
