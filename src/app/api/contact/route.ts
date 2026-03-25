import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isValidEmail } from '@/lib/validation';
import { checkRateLimit, getClientIp } from '@/lib/rateLimiter';
import logger from '@/lib/logger';

/**
 * Contact form submission endpoint
 * POST /api/contact
 *
 * Accepts: { firstName, lastName, email, phoneNumber, message }
 * Validates, then forwards to Web3Forms with the server-side API key.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await checkRateLimit('contact', getClientIp(request));
    if (limited) return limited;

    const body = await request.json();
    const { firstName, lastName, email, phoneNumber, message } = body;

    if (!firstName?.trim()) {
      return NextResponse.json(
        { error: 'First name is required' },
        { status: 400 }
      );
    }

    if (!lastName?.trim()) {
      return NextResponse.json(
        { error: 'Last name is required' },
        { status: 400 }
      );
    }

    if (!email?.trim() || !isValidEmail(email)) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 }
      );
    }

    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (message.length > 1000) {
      return NextResponse.json(
        { error: 'Message too long (max 1000 characters)' },
        { status: 400 }
      );
    }

    const accessKey = process.env.WEB3FORMS_ACCESS_KEY;
    if (!accessKey) {
      logger.error('WEB3FORMS_ACCESS_KEY not configured');
      return NextResponse.json(
        { error: 'Contact form is not configured' },
        { status: 503 }
      );
    }

    // forward to Web3Forms with the secret key (server-side only)
    const formData = new FormData();
    formData.append('access_key', accessKey);
    formData.append('first_name', firstName.trim());
    formData.append('last_name', lastName.trim());
    formData.append('email', email.trim());
    if (phoneNumber?.trim()) formData.append('phone', phoneNumber.trim());
    formData.append('message', message.trim());

    const web3Res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      body: formData,
    });

    const web3Data = await web3Res.json();

    if (!web3Data.success) {
      logger.error('web3forms submission failed', { response: web3Data });
      return NextResponse.json(
        { error: 'Failed to send message' },
        { status: 502 }
      );
    }

    logger.info('contact form submission', {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phoneNumber: phoneNumber?.trim() || null,
      submittedAt: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Thank you for reaching out! We\'ll get back to you soon.',
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('contact form error', { error });

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to process contact form submission' },
      { status: 500 }
    );
  }
}

// Handle other methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
