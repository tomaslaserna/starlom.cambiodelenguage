// Shared result type for the create-quote server action. Kept out of the
// "use server" actions file, which may only export async functions.
export type CreateQuoteState = { ok: boolean; nonce?: number; error?: string };
