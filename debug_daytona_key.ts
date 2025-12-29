
import { Daytona } from '@daytonaio/sdk';

// SECURITY: Never hardcode API keys - use environment variables
const apiKey = process.env.DAYTONA_API_KEY || '';
const serverUrl = process.env.DAYTONA_API_URL || 'https://app.daytona.io/api';

async function main() {
    if (!apiKey) {
        console.error('✗ DAYTONA_API_KEY environment variable not set');
        console.error('Usage: DAYTONA_API_KEY=your_key npx tsx debug_daytona_key.ts');
        process.exit(1);
    }

    console.log('Testing Daytona API Key...');
    const daytona = new Daytona({ apiKey, serverUrl });

    try {
        console.log('Attempting to list workspaces...');
        const workspaces = await daytona.list();
        const workspaceArray = Array.isArray(workspaces) ? workspaces : (workspaces as any).items || [];
        console.log('✓ Success! Workspaces found:', workspaceArray.length);
        workspaceArray.forEach((w: any) => console.log(`- ${w.id} (${w.name})`));
    } catch (error) {
        console.error('✗ API Key/Connection Failed:', error);
    }
}

main();
