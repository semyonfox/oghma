import validatorPkg from "validator";

const { isEmail } = validatorPkg;

function isValidEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    isEmail(value.trim(), { allow_ip_domain: false, require_tld: true })
  );
}

function passwordErrors(password: unknown): string[] {
  if (typeof password !== "string" || password.length === 0) {
    return ["Password is required"];
  }

  const errors: string[] = [];
  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }
  if (password.length > 128) {
    errors.push("Password must be 128 characters or fewer");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  return errors;
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
