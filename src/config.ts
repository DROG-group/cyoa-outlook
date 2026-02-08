export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:3000",
  database: {
    connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/cyoa_outlook",
  },
  outlook: {
    originatorId: process.env.OUTLOOK_ORIGINATOR_ID || "",
    senderEmail: process.env.OUTLOOK_SENDER_EMAIL || "",
  },
} as const;
