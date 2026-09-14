/**
 * @template {{provider: string, id: string, input?: string[]}} T
 * @param {T[]} available
 * @param {{provider: string, id: string}[]} excluded
 * @param {{provider: string, id: string} | undefined} primary
 * @returns {T[]}
 */
export function liveWorkerPool(available, excluded, primary) {
  const denied = new Set(excluded.map((model) => `${model.provider}/${model.id}`));
  return available.filter((model) => model.input?.includes("text") &&
    !(model.provider === primary?.provider && model.id === primary?.id) &&
    !denied.has(`${model.provider}/${model.id}`));
}
