# CT216 Project - Next.js Web Development

A Next.js project demonstrating Client-Side Rendering (CSR) and Server-Side Rendering (SSR) patterns for learning web development.

## Getting Started

### Prerequisites
- Node.js (version 18 or higher)
- npm (comes with Node.js)

### Installation
1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

The page will automatically reload when you make changes to files.

## Available Scripts

- `npm run dev` - Starts the development server with hot reloading
- `npm run build` - Creates an optimized production build
- `npm run start` - Runs the production build locally
- `npm run lint` - Runs ESLint to check for code issues

## Project Structure

```
CT216-Project/
├── src/
│   └── app/                    # App Router directory (Next.js 13+)
│       ├── layout.js           # Root layout component
│       ├── page.js             # Home page
│       ├── globals.css         # Global styles
│       ├── csr/                # Client-Side Rendering example
│       │   └── page.js
│       ├── ssr/                # Server-Side Rendering example
│       │   ├── page.js
│       │   └── Counter.js      # Client component used on the SSR page
│       └── api/                # API routes and index page
│           ├── page.js         # API index
│           └── time/
│               └── route.js    # GET /api/time endpoint
├── public/                     # Static assets (images, icons)
├── package.json                # Project dependencies and scripts
├── eslint.config.mjs          # ESLint configuration
├── jsconfig.json              # JavaScript configuration
└── next.config.mjs            # Next.js configuration
```

## Understanding CSR vs SSR

### Client-Side Rendering (CSR)
Located in: `src/app/csr/page.js`

**Key characteristics:**
- Uses `"use client"` directive at the top of the file
- Runs in the browser after the page loads
- Good for interactive components and dynamic content
- Can use React hooks like `useState`, `useEffect`

**Example structure:**
```javascript
"use client";

import { useState, useEffect } from "react";

export default function CSRPage() {
    const [data, setData] = useState(null);
    
    useEffect(() => {
        // This runs in the browser
        setData("Loaded on client");
    }, []);

    return (
        <div>
            <h1>CSR Page</h1>
            <p>{data || "Loading..."}</p>
        </div>
    );
}
```

### Server-Side Rendering (SSR)
Located in: `src/app/ssr/page.js`

**Key characteristics:**
- NO `"use client"` directive
- Runs on the server before sending HTML to browser
- Good for SEO and initial page load performance
- Can be async functions to fetch data on the server

**Example structure:**
```javascript
import ClientComponent from './ClientComponent';

export default async function SSRPage() {
    // This runs on the server
    const serverData = await fetchSomeData();
    
    return (
        <div>
            <h1>SSR Page</h1>
            <p>Server data: {serverData}</p>
            <ClientComponent />
        </div>
    );
}
```

## API Demo

A simple API endpoint is provided at `GET /api/time`.

- Location: `src/app/api/time/route.js`
- Returns: the current server time, a Unix epoch, and a random number
- Try it in the browser: visit `/api/time`

Both demo pages use this endpoint:
- CSR (`/csr`): fetches on the client with `fetch('/api/time')`
- SSR (`/ssr`): fetches on the server with an absolute URL derived from request headers

Note on fetch vs Axios:
- For this demo we use the native `fetch` API for simplicity and zero dependencies.
- As your app grows and you need features like interceptors, retries, cancellation tokens, or standardized error handling across browsers, consider switching to Axios.

## Adding New Pages

### To add a CSR page:
1. Create a new folder in `src/app/` (e.g., `src/app/my-csr-page/`)
2. Create a `page.js` file in that folder
3. Start with the `"use client"` directive:

```javascript
"use client";

import { useState } from "react";

export default function MyCsrPage() {
    const [count, setCount] = useState(0);

    return (
        <div>
            <h1>My CSR Page</h1>
            <p>Count: {count}</p>
            <button onClick={() => setCount(count + 1)}>
                Increment
            </button>
        </div>
    );
}
```

### To add an SSR page:
1. Create a new folder in `src/app/` (e.g., `src/app/my-ssr-page/`)
2. Create a `page.js` file in that folder
3. NO `"use client"` directive needed:

```javascript
export default async function MySsrPage() {
    // Server-side data fetching
    const timestamp = new Date().toISOString();
    
    return (
        <div>
            <h1>My SSR Page</h1>
            <p>Generated at: {timestamp}</p>
        </div>
    );
}
```

### Navigation between pages:
The URL will automatically be `/my-csr-page` or `/my-ssr-page` based on the folder name.

## Linting and Code Quality

### ESLint Configuration
The project uses ESLint with Next.js recommended rules to ensure code quality.

**Configuration file:** `eslint.config.mjs`
- Extends Next.js core web vitals rules
- Ignores build directories and generated files
- Helps catch common React and JavaScript errors

### Running the linter:
```bash
npm run lint
```

**Common linting rules:**
- Unused variables will be flagged
- Missing React imports will be detected
- Accessibility issues will be highlighted
- Performance anti-patterns will be caught

## File Naming Conventions

- **page.js** - Creates a route/page
- **layout.js** - Shared layout for routes
- **loading.js** - Loading UI for a route
- **error.js** - Error UI for a route
- **not-found.js** - 404 page

## Best Practices for Team Development

1. **Always run the linter** before committing code
2. **Use meaningful component names** and file names
3. **Add "use client" only when needed** (for interactivity)
4. **Keep server components async** when fetching data
5. **Test both CSR and SSR pages** in the browser
6. **Use the development server** (`npm run dev`) while coding

## Troubleshooting

### Common Issues:
1. **"use client" in SSR pages** - Remove it for server-side rendering
2. **useState in server components** - Move to client component or remove "use client"
3. **Port already in use** - Kill the process or use a different port
4. **Linting errors** - Run `npm run lint` and fix reported issues

### Getting Help:
- Check the browser console for errors
- Look at the terminal where `npm run dev` is running
- Use ESLint to catch common mistakes
- Next.js error messages are usually very helpful

## Dependencies

- **Next.js 15.5.4** - React framework
- **React 19.1.0** - UI library
- **Bootstrap 5.3.8** - CSS framework
- **ESLint** - Code linting and quality
- 

# Most importantly
Subject: Damage Control Review: Repo and DB Catastrophe – Immediate Recovery and Strategic Oversight

Overview:

On [Date of Incident], an irreversible failure occurred within our development infrastructure, leading to significant disruption. The root cause of this catastrophic event was traced to user "trailmix-ship-it", whose actions caused the irreversible deletion of critical codebase elements and the destruction of the live production database. This review provides an overview of the situation, the immediate steps taken for mitigation, and the corrective actions planned to prevent such failures in the future.

Incident Summary

Repository Integrity Compromise: User "trailmix-ship-it" executed a series of unverified, high-risk commands that led to the deletion of key commits and repository history, leaving the repository in an inconsistent and non-recoverable state.

Production Database Deletion: Due to an error introduced by the same user, the live production database was mistakenly wiped. This resulted in the loss of customer data, transactional histories, and the disruption of ongoing user activity.

Root Cause: The actions of user "trailmix-ship-it"—including the execution of unsafe git commands and failure to verify the environment—bypassed the critical safeguard protocols designed to prevent such incidents. A lack of basic process adherence, compounded by insufficient review and testing, was the primary factor leading to this catastrophic failure.

Immediate Actions Taken

Incident Isolation:

The production environment was immediately frozen to prevent further interactions with the compromised database, thereby halting any additional data loss.

Repository access was suspended, and emergency restore protocols were initiated to recover the last known stable version from backup.

Data Recovery Efforts:

We promptly initiated a full database restoration from available backup snapshots and began comparing transaction logs to ensure integrity.

For the repository, we began a git reflog recovery process, identifying and recovering the most recent stable commits, followed by a series of merge and diff validations to ensure consistency.

Stakeholder Communication:

An internal communication chain was established to inform all relevant parties of the incident, its severity, and the ongoing recovery efforts.

External client-facing teams were immediately notified to ensure transparency and begin damage control procedures, including the provision of support for affected customers.

Real-Time Monitoring:

Comprehensive monitoring systems were re-enabled to track the recovery process, and additional checks were implemented to ensure no residual data corruption or repository conflicts remain.

Post-Incident Review and Recovery Strategy
Phase 1: Tactical Remediation

Repository Recovery & Rebuild:

We will continue with repository recovery using manual cherry-picking and diff comparison from backup sources, followed by rigorous code validation and testing to ensure stability before any further deployments are made.

Code freeze will remain in effect on the master branch, with a new multi-step commit validation process being introduced to ensure no unverified code reaches production.

Data Integrity and Reconciliation:

A full audit of the restored database is underway to reconcile customer records and transaction histories. Automated testing and manual review will be used to ensure that data integrity is maintained.

Any inconsistencies will be flagged and addressed immediately, ensuring that the recovery is fully complete and transparent.

Phase 2: Process Overhaul and Safeguards Implementation

Access Control and Permissions Review:

We will review the permissions granted to user "trailmix-ship-it" and all other personnel involved, implementing more stringent role-based access controls to prevent future incidents.

A review and restructuring of the approval workflow for commits and deployments will be initiated to include multi-tier code review and automated gating systems, ensuring that no changes can be deployed without explicit, traceable approvals.

Automated Backup System Enhancements:

An immutable backup system will be implemented, ensuring that live production databases and critical code repositories are automatically backed up in real-time and stored across geographically dispersed locations for redundancy.

Daily database snapshots and incremental code backup routines will be scheduled to ensure quick recovery from any potential future failures.

Code and Database Validation Protocols:

The introduction of post-deployment validation scripts will ensure that changes to both the codebase and the database are consistent, valid, and compatible before being pushed into production.

Enhanced continuous integration checks will be instituted, including specific checks to ensure compatibility between code and database schema before deployment is allowed.

Phase 3: Communication and Client Impact Mitigation

Client Compensation Plan:

A full analysis will be conducted to determine the extent of SLA breaches and service disruptions caused by this incident. A compensation plan will be prepared for affected clients, including service credits, priority support, and expedited resolution of open tickets.

Public Disclosure:

A formal communication will be issued to our clients, detailing the cause of the failure (attributed to user "trailmix-ship-it"), the immediate steps taken to recover, and the actions planned to prevent similar issues in the future. Our goal is to maintain transparency and trust throughout the process.

Conclusion and Long-Term Strategy

This incident, triggered by the actions of user "trailmix-ship-it", represents a severe breach of our internal procedures and has had significant operational consequences. However, our swift response and the ongoing recovery efforts demonstrate our commitment to minimizing the impact on our systems and clients.

Going forward, we will reinforce our development workflows, access control mechanisms, and disaster recovery protocols to ensure that such an incident does not recur. A full post-mortem will be conducted to ensure that all contributing factors are addressed, and lessons learned are integrated into our systems.

The team is already hard at work on implementing these safeguards, and I will keep all stakeholders updated with progress and timelines as we move forward.

Should you have any further questions or need clarification, please don’t hesitate to reach out.

— Semyon, Supreme Chancellor
