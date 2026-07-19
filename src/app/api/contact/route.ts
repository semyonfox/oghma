import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/database/pgsql.js";
import { withErrorHandler } from "@/lib/api-error";
import logger from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import { recordMarketingEvent } from "@/lib/marketing/events";
import { cleanAttribution } from "@/lib/marketing/attribution";
import { sendEmail } from "@/lib/email.js";

const contactSchema = z.object({
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  role: z.enum(["student", "lecturer", "university_staff", "partner_or_press"]),
  interest: z.enum([
    "beta_access",
    "campus_pilot",
    "support",
    "billing",
    "partnership",
  ]),
  institution: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(80).optional().default(""),
  message: z.string().trim().min(1).max(5000),
  marketing: z
    .object({
      utm: z
        .object({
          source: z.string().max(120).optional(),
          medium: z.string().max(120).optional(),
          campaign: z.string().max(120).optional(),
          content: z.string().max(120).optional(),
          term: z.string().max(120).optional(),
        })
        .optional(),
    })
    .optional(),
  source: z.enum(["contact", "home"]).optional().default("contact"),
  website: z.string().trim().max(200).optional().default(""),
});

function leadAnalyticsProperties(body: z.infer<typeof contactSchema>) {
  const messageLength = body.message.length;
  return {
    page: body.source,
    form: "contact",
    role: body.role,
    interest: body.interest,
    has_institution: body.institution.length > 0,
    has_phone: body.phone.length > 0,
    message_length_bucket:
      messageLength <= 100
        ? "0-100"
        : messageLength <= 500
          ? "101-500"
          : "500+",
  };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

async function sendContactNotification(body: z.infer<typeof contactSchema>) {
  const from = process.env.EMAIL_FROM || process.env.CLOUDFLARE_EMAIL_FROM;
  const to = process.env.CONTACT_TO_EMAIL;
  if (!from || !to) {
    return { delivered: false, error: "contact_email_not_configured" };
  }

  const name = `${body.first_name} ${body.last_name}`;
  const text = [
    "New OghmaNotes website lead",
    "",
    `Name: ${name}`,
    `Email: ${body.email}`,
    `Role: ${body.role}`,
    `Interest: ${body.interest}`,
    `Institution: ${body.institution || "Not provided"}`,
    `Phone: ${body.phone || "Not provided"}`,
    "",
    body.message,
  ].join("\n");
  const html = `<h1>New OghmaNotes website lead</h1>
<p><strong>Name:</strong> ${escapeHtml(name)}<br>
<strong>Email:</strong> ${escapeHtml(body.email)}<br>
<strong>Role:</strong> ${escapeHtml(body.role)}<br>
<strong>Interest:</strong> ${escapeHtml(body.interest)}<br>
<strong>Institution:</strong> ${escapeHtml(body.institution || "Not provided")}<br>
<strong>Phone:</strong> ${escapeHtml(body.phone || "Not provided")}</p>
<p>${escapeHtml(body.message).replace(/\n/g, "<br>\n")}</p>`;

  try {
    await sendEmail({
      from,
      to,
      replyTo: body.email,
      subject: "OghmaNotes website lead",
      text,
      html,
    });
    return { delivered: true, error: null };
  } catch (error) {
    logger.warn("contact notification delivery failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { delivered: false, error: "contact_email_delivery_failed" };
  }
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const limited = await checkRateLimit("contact", getClientIp(request));
  if (limited) return limited;

  const rawBody = await request.json().catch(() => null);
  const parsed = contactSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid contact submission" },
      { status: 400 },
    );
  }

  const body = parsed.data;
  // Silently accept honeypot submissions so bots do not learn which field
  // triggered the rejection. Do not store or forward them.
  if (body.website) {
    return NextResponse.json({ success: true, notificationDelivered: false });
  }

  const attribution = cleanAttribution(body.marketing?.utm);
  const [lead] = await sql`
    INSERT INTO app.marketing_leads (
      first_name,
      last_name,
      email,
      role,
      interest,
      institution,
      phone,
      message,
      source,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      first_touch,
      notification_delivered,
      notification_error
    )
    VALUES (
      ${body.first_name},
      ${body.last_name},
      ${body.email},
      ${body.role},
      ${body.interest},
      ${body.institution || null},
      ${body.phone || null},
      ${body.message},
      ${"contact_form"},
      ${attribution.source ?? null},
      ${attribution.medium ?? null},
      ${attribution.campaign ?? null},
      ${attribution.content ?? null},
      ${attribution.term ?? null},
      ${sql.json({})},
      false,
      null
    )
    RETURNING id
  `;

  const notification = await sendContactNotification(body);
  try {
    await sql`
      UPDATE app.marketing_leads
      SET notification_delivered = ${notification.delivered},
          notification_error = ${notification.error}
      WHERE id = ${lead.id}::uuid
    `;
  } catch (updateError) {
    // The submission is already durable. Do not invite a duplicate browser
    // retry merely because recording notification delivery failed.
    logger.warn("failed to update contact forwarding status", {
      leadId: lead.id,
      error:
        updateError instanceof Error
          ? updateError.message
          : String(updateError),
    });
  }

  await recordMarketingEvent(
    {
      eventName: "contact_form_success",
      path: request.nextUrl.pathname,
      utm: attribution,
      properties: {
        ...leadAnalyticsProperties(body),
        notification_delivered: notification.delivered,
      },
    },
    request,
    { trusted: false },
  ).catch((eventError) => {
    logger.warn("failed to record contact marketing event", {
      error: eventError.message,
    });
  });

  return NextResponse.json({
    success: true,
    notificationDelivered: notification.delivered,
  });
});
