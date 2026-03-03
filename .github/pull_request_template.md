## What does this PR do?

<!-- Briefly describe what you built and why -->

## Implementation Notes

<!-- Any gotchas, decisions, or things to know -->

## Testing

<!-- How did you test this? -->
- [ ] Manual testing completed
- [ ] Tested happy path
- [ ] Tested error cases

## Checklist

- [ ] Code follows the auth pattern in `/src/app/api/auth/login/route.js`
- [ ] All functions have JSDoc with purpose + security notes
- [ ] No `console.log` statements (except in development)
- [ ] Error handling: catches errors, returns proper HTTP status
- [ ] Input validation: checks user inputs, uses parameterized SQL queries
- [ ] No security vulnerabilities (SQL injection, XSS, CSRF)
- [ ] ESLint passes (`npm run lint`)

## Related

<!-- Link to GitHub issue or spec -->
Closes #
Spec: docs/README.md
