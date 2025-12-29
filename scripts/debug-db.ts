
import { db } from '../projects/db.js';

async function listProjects() {
    try {
        const projects = await db.query`SELECT * FROM projects`;
        console.log('--- PROJECTS DUMP ---');
        for await (const p of projects) {
            console.log(`ID: ${p.id}, Name: ${p.name}, Owner: ${p.clerk_user_id}`);
        }
        console.log('---------------------');
    } catch (err) {
        console.error('Failed to list projects:', err);
    }
}

listProjects();
