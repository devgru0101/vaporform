/**
 * Temporary script to list all Daytona sandboxes
 * This helps us find the sandbox ID for project 12
 */

import { Daytona } from '@daytonaio/sdk';

const apiKey = process.env.DAYTONA_API_KEY || '';
const apiUrl = process.env.DAYTONA_API_URL || 'https://app.daytona.io/api';

async function listSandboxes() {
  console.log('Connecting to Daytona API...');
  console.log('API URL:', apiUrl);
  console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING');

  const daytona = new Daytona({ apiKey, apiUrl });

  try {
    console.log('\nListing all sandboxes...\n');

    const sandboxList = await daytona.list();

    if (!sandboxList || !sandboxList.items || sandboxList.items.length === 0) {
      console.log('No sandboxes found.');
      return;
    }

    console.log(`Found ${sandboxList.items.length} sandbox(es):\n`);

    for (const sandbox of sandboxList.items) {
      console.log('========================================');
      console.log(`ID: ${sandbox.id}`);
      console.log(`State: ${sandbox.state}`);
      console.log(`Template: ${(sandbox as any).template || 'N/A'}`);
      console.log(`Created: ${sandbox.createdAt}`);
      console.log(`Labels:`, JSON.stringify(sandbox.labels || {}, null, 2));
      console.log('========================================\n');
    }
  } catch (error) {
    console.error('Error listing sandboxes:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
  }
}

listSandboxes();
