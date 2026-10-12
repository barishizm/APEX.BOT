// No email provider is wired up yet. Until one is (Resend, Postmark, SES, SMTP),
// codes are printed to the server log so the flow can be used in development.
export async function sendVerificationCode(email: string, code: string) {
  if (process.env.NODE_ENV === "production") {
    console.error("[mail] no email provider configured; a verification code was not sent")
    return
  }
  console.log(`[mail] verification code for ${email}: ${code}`)
}
