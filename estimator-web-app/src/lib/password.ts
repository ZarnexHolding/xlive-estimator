/** New-password rules, shared by sign-up and password reset. */
export const MIN_PASSWORD_LENGTH = 10;

/** What is wrong with a new password, or null when it is acceptable. */
export function newPasswordProblem(password: string, confirmation = password): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirmation) return "The two passwords do not match.";
  return null;
}
