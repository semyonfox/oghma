import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/database/pgsql.js";
import { withErrorHandler } from "@/lib/api-error";
import logger from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rateLimiter";
import { recordMarketingEvent } from "@/lib/marketing/events";

const contactSchema = z.object({
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  role: z
    .enum(["student", "lecturer", "university_staff", "partner_or_press"])
    .or(z.string().trim().min(1).max(80)),
  interest: z
    .enum(["beta_access", "campus_pilot", "support", "billing", "partnership"])
    .or(z.string().trim().min(1).max(80)),
  institution: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(80).optional().default(""),
  message: z.string().trim().min(1).max(5000),
  marketing: z
    .object({
      sessionId: z.string().max(96).optional(),
      utm: z
        .object({
          source: z.string().max(120).optional(),
          medium: z.string().max(120).optional(),
          campaign: z.string().max(120).optional(),
          content: z.string().max(120).optional(),
          term: z.string().max(120).optional(),
        })
        .optional(),
      firstTouch: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  source: z.string().trim().max(120).optional().default("contact_form"),
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
      messageLength <= 100 ? "0-100" : messageLength <= 500 ? "101-500" : "500+",
  };
}

async function forwardToWeb3Forms(body: z.infer<typeof contactSchema>) {
  const accessKey =
    process.env.WEB3FORMS_KEY || process.env.NEXT_PUBLIC_WEB3FORMS_KEY;
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
  const forward = await forwardToWeb3Forms(body);

  await sql`
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
      session_id,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      first_touch,
      forwarded_to_web3forms,
      forward_error,
      user_agent
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
      ${body.source},
      ${body.marketing?.sessionId ?? null},
      ${body.marketing?.utm?.source ?? null},
      ${body.marketing?.utm?.medium ?? null},
      ${body.marketing?.utm?.campaign ?? null},
      ${body.marketing?.utm?.content ?? null},
      ${body.marketing?.utm?.term ?? null},
      ${sql.json(body.marketing?.firstTouch ?? {})},
      ${forward.forwarded},
      ${forward.error},
      ${request.headers.get("user-agent")?.slice(0, 300) ?? null}
    )
  `;

  await recordMarketingEvent(
    {
      eventName: "contact_form_success",
      sessionId: body.marketing?.sessionId,
      path: request.nextUrl.pathname,
      source: "contact_api",
      utm: body.marketing?.utm,
      properties: {
        ...leadAnalyticsProperties(body),
        forwarded_to_web3forms: forward.forwarded,
        first_touch: body.marketing?.firstTouch,
      },
    },
    request,
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
