{
	/**
	 * Encore.ts Application Configuration
	 * 
	 * This file configures the Encore.ts backend framework for the Vaporform application.
	 * 
	 * STRUCTURE:
	 * - id: Unique application identifier (empty for local development)
	 * - lang: Programming language used (typescript)
	 * - global: Global application settings
	 */
	
	"id": "",
	"lang": "typescript",
	
	"global": {
		/**
		 * CORS (Cross-Origin Resource Sharing) Configuration
		 * 
		 * Allows the frontend (running on a different origin) to make API requests to this backend.
		 * 
		 * IMPORTANT SECURITY NOTES:
		 * - In development, we allow specific origins for convenience
		 * - In production, restrict to your actual frontend domain only
		 * - Never use wildcards (*) in production for origins
		 * 
		 * REMOTE DEVELOPMENT:
		 * The 192.168.1.236:3000 origin allows access from other machines on the local network,
		 * which is essential for remote development scenarios (e.g., coding from a different device).
		 */
		"cors": {
			/**
			 * allow_origins_without_credentials:
			 * List of origins that can make requests without sending cookies/credentials.
			 * This is safe for public API endpoints that don't require authentication.
			 * 
			 * Included origins:
			 * - localhost:3000 - Standard local development
			 * - 127.0.0.1:3000 - Explicit localhost IP
			 * - 192.168.1.236:3000 - LAN IP for remote development access
			 */ 
			"allow_origins_without_credentials": [
				"http://localhost:3000",
				"http://127.0.0.1:3000",
				"http://192.168.1.236:3000"
			],
			
			/**
			 * allow_headers:
			 * Headers that the frontend can send in requests.
			 * "*" allows all headers (fine for development, restrict in production if needed)
			 */
			"allow_headers": ["*"]
		}
	}
}

