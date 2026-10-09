"use client";

import { useActionState } from "react";
import { setupAction } from "@/app/actions";

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input id="name" name="name" className="input" autoComplete="name" required />
      </div>
      <div>
        <label className="label" htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
      </div>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Setting up…" : "Create my admin account"}</button>
    </form>
  );
}
