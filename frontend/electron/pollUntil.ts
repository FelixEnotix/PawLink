/** Short sleep between condition checks — not a deadline. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll until `condition` is true. No fixed overall timeout. */
export async function pollUntil(
  condition: () => boolean | Promise<boolean>,
  pollMs = 100,
): Promise<void> {
  while (!(await condition())) {
    await sleep(pollMs);
  }
}

/** Poll until true or `deadlineMs` elapsed (startup / user-action safety only). */
export async function pollUntilOrThrow(
  condition: () => boolean | Promise<boolean>,
  onTimeout: () => Error,
  pollMs = 100,
  deadlineMs?: number,
): Promise<void> {
  const started = deadlineMs != null ? Date.now() : 0;
  while (!(await condition())) {
    if (deadlineMs != null && Date.now() - started >= deadlineMs) {
      throw onTimeout();
    }
    await sleep(pollMs);
  }
}
