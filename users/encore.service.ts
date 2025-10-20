import { Service } from "encore.dev/service";
import { secret } from 'encore.dev/config';
import { initClerk } from '../shared/clerk-init.js';

// Define Clerk secrets for this service
// Note: Secret names are globally unique - all services using these names get the same values
const clerkSecretKey = secret("ClerkSecretKey");
const clerkPublishableKey = secret("ClerkPublishableKey");
const clerkWebhookSecret = secret("ClerkWebhookSecret");

// Initialize Clerk for all services to use
initClerk(clerkSecretKey(), clerkPublishableKey(), clerkWebhookSecret());

export default new Service("users");
