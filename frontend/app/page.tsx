import Link from 'next/link';
import { SignInButton, SignedIn, SignedOut, UserButton } from '@clerk/nextjs';

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white font-mono">
      {/* Navigation */}
      <nav className="border-b-4 border-white p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">VAPORFORM</h1>
        <div>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="px-6 py-2 border-2 border-white hover:bg-white hover:text-black font-bold">
                SIGN IN
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="px-6 py-2 border-2 border-[#00FF41] bg-[#00FF41] text-black font-bold hover:bg-white"
              >
                GO TO DASHBOARD
              </Link>
              <UserButton />
            </div>
          </SignedIn>
        </div>
      </nav>

      {/* Hero */}
      <main className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-6xl font-bold mb-4">
            AGENTIC DEVELOPMENT<br />ENVIRONMENT
          </h2>
          <p className="text-2xl text-[#00D9FF] mb-8">
            Cloud-based IDE with AI-powered code generation
          </p>

          <div className="grid md:grid-cols-3 gap-8 my-16">
            <div className="border-4 border-white p-6">
              <div className="text-[#00FF41] text-4xl font-bold mb-2">AI</div>
              <h3 className="text-xl font-bold mb-2">KiloCode Assistant</h3>
              <p className="text-sm">
                GPT-4 powered code generation with RAG context retrieval
              </p>
            </div>

            <div className="border-4 border-white p-6">
              <div className="text-[#00D9FF] text-4xl font-bold mb-2">VFS</div>
              <h3 className="text-xl font-bold mb-2">Virtual File System</h3>
              <p className="text-sm">
                MongoDB GridFS with versioning and metadata tracking
              </p>
            </div>

            <div className="border-4 border-white p-6">
              <div className="text-[#00FF41] text-4xl font-bold mb-2">GIT</div>
              <h3 className="text-xl font-bold mb-2">Version Control</h3>
              <p className="text-sm">
                Full Git integration with visual timeline and rollback
              </p>
            </div>
          </div>

          <div className="border-4 border-white p-8 bg-white text-black">
            <h3 className="text-3xl font-bold mb-4">FEATURES</h3>
            <div className="grid md:grid-cols-2 gap-4 text-left">
              <div>
                <div className="font-bold mb-1">● Monaco Editor</div>
                <div className="text-sm mb-3">Full VS Code editing experience</div>
              </div>
              <div>
                <div className="font-bold mb-1">● Terminal Access</div>
                <div className="text-sm mb-3">WebSocket-based PTY sessions</div>
              </div>
              <div>
                <div className="font-bold mb-1">● Docker Deployments</div>
                <div className="text-sm mb-3">Dynamic subdomains and ports</div>
              </div>
              <div>
                <div className="font-bold mb-1">● Usage Tracking</div>
                <div className="text-sm mb-3">Quota enforcement and billing</div>
              </div>
            </div>
          </div>

          <SignedOut>
            <div className="mt-12">
              <SignInButton mode="modal">
                <button className="px-12 py-4 border-4 border-white bg-[#00FF41] text-black text-xl font-bold hover:bg-white">
                  GET STARTED FREE
                </button>
              </SignInButton>
            </div>
          </SignedOut>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t-4 border-white p-8 mt-20">
        <div className="container mx-auto text-center">
          <p className="text-sm text-gray-400">
            Built with Encore.ts, Next.js, MongoDB, Qdrant, and OpenAI
          </p>
        </div>
      </footer>
    </div>
  );
}
