import { wrapCardInEmail } from "./card-wrapper.js";

/**
 * Send the initial game email with the Adaptive Card embedded.
 *
 * In production, this would use Microsoft Graph API:
 *   POST https://graph.microsoft.com/v1.0/me/sendMail
 *
 * For now, this is a placeholder that returns the email HTML
 * for testing and manual sending.
 */
export async function sendGameEmail(
  recipientEmail: string,
  card: Record<string, unknown>,
): Promise<{ html: string; subject: string }> {
  const subject = "Bad News: Can You Spot Disinformation? Play Now!";
  const html = wrapCardInEmail(card);

  // TODO: Integrate with Microsoft Graph API for actual sending:
  //
  // const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
  //   method: "POST",
  //   headers: {
  //     "Authorization": `Bearer ${accessToken}`,
  //     "Content-Type": "application/json"
  //   },
  //   body: JSON.stringify({
  //     message: {
  //       subject,
  //       body: { contentType: "HTML", content: html },
  //       toRecipients: [{ emailAddress: { address: recipientEmail } }]
  //     }
  //   })
  // });

  console.log(`[email] Would send game email to ${recipientEmail} (${html.length} bytes)`);

  return { html, subject };
}
