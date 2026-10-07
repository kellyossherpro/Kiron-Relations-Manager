"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setTaskDoneAction } from "@/app/actions";

export function TaskToggle({ id, done, label }: { id: string; done: boolean; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      aria-label={done ? `Reopen: ${label}` : `Mark done: ${label}`}
      className="mt-0.5 size-5 shrink-0 accent-[#2f6b00]"
      checked={done}
      disabled={pending}
      onChange={() =>
        start(async () => {
          await setTaskDoneAction(id, !done);
          router.refresh();
        })
      }
    />
  );
}
