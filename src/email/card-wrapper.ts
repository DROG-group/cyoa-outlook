/**
 * Wrap an Adaptive Card JSON in an Outlook Actionable Message email HTML.
 *
 * The <script type="application/adaptivecard+json"> tag embeds the card
 * into the email. Outlook clients will render it; other clients see the
 * fallback HTML body.
 */
export function wrapCardInEmail(card: Record<string, unknown>, fallbackHtml?: string): string {
  const cardJson = JSON.stringify(card);

  const fallback =
    fallbackHtml ||
    `<h1>Bad News: The Disinformation Game</h1>
     <p>This interactive email game teaches you about disinformation tactics by having you play as a fake news tycoon.</p>
     <p>To play, open this email in Outlook (desktop or web).</p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <script type="application/adaptivecard+json">
${cardJson}
  </script>
</head>
<body>
  ${fallback}
</body>
</html>`;
}
