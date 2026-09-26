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
    label: "No more than 128 characters",
    error: "Password must be 128 characters or fewer",
    check: (password: string) => password.length <= 128,
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

function passwordErrors(password: unknown): string[] {
  if (typeof password !== "string" || password.length === 0) {
    return ["Password is required"];
  }

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
    errors.email = "Email is required";
  }
  if (email && !isValidEmail(email)) {
    errors.email = "Invalid email format";
  }

  if (
    password == null ||
    password === "" ||
    (typeof password === "string" && password.trim().length === 0)
  ) {
    errors.password = "Password is required";
  }
  if (checkPasswordStrength && password) {
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
