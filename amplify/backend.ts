import { defineBackend } from '@aws-amplify/backend';

// Amplify Gen 2 backend entry point.
// VPC configuration (subnets + security groups for Valkey/ElastiCache access)
// is managed from the Amplify console — no CDK changes needed here for that.
// Add Amplify-managed resources here as needed (e.g. storage, auth, functions).
export const backend = defineBackend({});
