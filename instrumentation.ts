export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Encrypt any pre-existing plaintext channel secrets before serving traffic.
  const { encryptPlaintextChannels } = await import("./lib/secrets-migrate");
  await encryptPlaintextChannels().catch((e) =>
    console.error("[secrets] migration failed:", e),
  );
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
