import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/database/pgsql.js";
import { withErrorHandler } from "@/lib/api-error";
import logger from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import { recordMarketingEvent } from "@/lib/marketing/events";
import { cleanAttribution } from "@/lib/marketing/attribution";

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

async function forwardToWeb3Forms(body: z.infer<typeof contactSchema>) {
  const accessKey = process.env.WEB3FORMS_ACCESS_KEY;
  if (!accessKey) {
    return { forwarded: false, error: "web3forms_not_configured" };
  }

  const formData = new FormData();
  formData.append("access_key", accessKey);
  formData.append("subject", "OghmaNotes website lead");
  formData.append("from_name", "OghmaNotes website");
  formData.append("first_name", body.first_name);
  formData.append("last_name", body.last_name);
  formData.append("email", body.email);
  formData.append("role", body.role);
  formData.append("interest", body.interest);
  formData.append("institution", body.institution);
  formData.append("phone", body.phone);
  formData.append("message", body.message);

  try {
    const response = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(5_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      return { forwarded: false, error: "web3forms_error" };
    }
    return { forwarded: true, error: null };
  } catch (error) {
    logger.warn("web3forms forward failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { forwarded: false, error: "web3forms_network_error" };
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
    return NextResponse.json({ success: true, forwardedToWeb3Forms: false });
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
      forwarded_to_web3forms,
      forward_error
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

  const forward = await forwardToWeb3Forms(body);
  try {
    await sql`
      UPDATE app.marketing_leads
      SET forwarded_to_web3forms = ${forward.forwarded},
          forward_error = ${forward.error}
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
        forwarded_to_web3forms: forward.forwarded,
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
    forwardedToWeb3Forms: forward.forwarded,
  });
});
