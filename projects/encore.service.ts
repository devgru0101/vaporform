import { Service } from "encore.dev/service";
import { secret } from 'encore.dev/config';
import { initClerk } from '../shared/clerk-init.js';

// Define Clerk secrets for this service
const clerkSecretKey = secret("ClerkSecretKey");
const clerkPublishableKey = secret("ClerkPublishableKey");
const clerkWebhookSecret = secret("ClerkWebhookSecret");

// Initialize Clerk
initClerk(clerkSecretKey(), clerkPublishableKey(), clerkWebhookSecret());

export default new Service("projects");
