import validatorPkg from "validator";

const { isEmail } = validatorPkg;

function isValidEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    isEmail(value.trim(), { allow_ip_domain: false, require_tld: true })
  );
}

const PASSWORD_REQUIREMENTS = [
  {
    id: "minimumLength",
    label: "At least 8 characters",
    error: "Password must be at least 8 characters long",
    check: (password: string) => password.length >= 8,
  },
  {
    id: "maximumLength",
    label: "No more than 72 UTF-8 bytes",
    error: "Password must be 72 UTF-8 bytes or fewer",
    check: (password: string) => new TextEncoder().encode(password).byteLength <= 72,
  },
  {
    id: "uppercase",
    label: "One uppercase letter",
    error: "Password must contain at least one uppercase letter",
    check: (password: string) => /[A-Z]/.test(password),
  },
  {
    id: "lowercase",
    label: "One lowercase letter",
    error: "Password must contain at least one lowercase letter",
    check: (password: string) => /[a-z]/.test(password),
  },
  {
    id: "number",
    label: "One number",
    error: "Password must contain at least one number",
    check: (password: string) => /[0-9]/.test(password),
  },
] as const;

export function getPasswordRequirements(password: string) {
  return PASSWORD_REQUIREMENTS.map(({ id, label, error, check }) => ({
    id,
    label,
    error,
    met: password.length > 0 && check(password),
  }));
}

function passwordErrors(password: string): string[] {
  return getPasswordRequirements(password)
    .filter((requirement) => !requirement.met)
    .map((requirement) => requirement.error);
}

export function validateAuthCredentials(
  email: unknown,
  password: unknown,
  checkPasswordStrength = false,
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (
    email == null ||
    email === "" ||
    (typeof email === "string" && email.trim().length === 0)
  ) {
    errors.email = "Enter your email address";
  } else if (!isValidEmail(email)) {
    errors.email = "Enter an email address like name@example.com";
  }

  if (typeof password !== "string" || password.trim().length === 0) {
    errors.password = "Enter your password";
  } else if (checkPasswordStrength) {
    const policyErrors = passwordErrors(password);
    if (policyErrors.length > 0) {
      errors.password = policyErrors.join("; ");
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
